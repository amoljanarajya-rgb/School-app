// Flutter — Teacher & Driver Mobile Portal with Offline Sync
// Reference implementation for the native Android/iOS app.
//
// Dependencies (pubspec.yaml):
//   supabase_flutter: ^2.0.0
//   sqflite: ^2.3.0              # Local SQLite database
//   mobile_scanner: ^5.0.0       # QR / barcode scanning via camera
//   camera: ^0.11.0              # Camera access for document scanning
//   path_provider: ^2.1.0        # Local file paths for SQLite + photos
//   connectivity_plus: ^6.0.0    # Online/offline detection
//   background_fetch: ^1.2.0     # Background sync service
//   image_picker: ^1.1.0         # Document/photo capture
//
// This file shows the core architecture: a local SQLite database that
// mirrors the server tables, a sync service that flushes pending
// operations to Supabase when connectivity is restored, and the
// Teacher + Driver screen widgets.

import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

// ─────────────────────────────────────────────────────────────────────────
// LOCAL DATABASE (SQLite) — mirrors the server schema for offline access
// ─────────────────────────────────────────────────────────────────────────

class LocalDatabase {
  static Database? _db;

  static Future<Database> db() async {
    if (_db != null) return _db!;
    final dir = await getApplicationDocumentsDirectory();
    _db = await openDatabase(
      p.join(dir.path, 'school_erp.db'),
      version: 1,
      onCreate: (db, v) async {
        // Sync queue: operations pending upload to server
        await db.execute('''
          CREATE TABLE sync_queue (
            id TEXT PRIMARY KEY,
            table_name TEXT NOT NULL,
            operation TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            attempts INTEGER DEFAULT 0,
            last_error TEXT
          )
        ''');
        // Local cache: student lists, route mappings, etc.
        await db.execute('''
          CREATE TABLE local_students (
            id TEXT PRIMARY KEY,
            admission_no TEXT,
            full_name TEXT,
            class_id TEXT,
            section_id TEXT,
            roll_no INTEGER,
            photo_url TEXT,
            guardian_phone TEXT,
            cached_at TEXT
          )
        ''');
        await db.execute('''
          CREATE TABLE local_bus_mappings (
            id TEXT PRIMARY KEY,
            student_id TEXT,
            bus_id TEXT,
            route_id TEXT,
            pickup_point TEXT,
            student_name TEXT,
            admission_no TEXT,
            boarding_status TEXT DEFAULT 'pending',
            boarding_time TEXT,
            cached_at TEXT
          )
        ''');
        await db.execute('''
          CREATE TABLE local_attendance (
            id TEXT PRIMARY KEY,
            student_id TEXT,
            class_id TEXT,
            section_id TEXT,
            attendance_date TEXT,
            status TEXT,
            synced INTEGER DEFAULT 0,
            created_at TEXT
          )
        ''');
      },
    );
    return _db!;
  }

  // Queue an operation for sync
  static Future<void> enqueue(String table, String operation, Map<String, dynamic> payload) async {
    final database = await db();
    await database.insert('sync_queue', {
      'id': DateTime.now().millisecondsSinceEpoch.toString() + payload.hashCode.toString(),
      'table_name': table,
      'operation': operation,
      'payload': jsonEncode(payload),
      'created_at': DateTime.now().toIso8601String(),
    });
  }

  static Future<List<Map<String, dynamic>>> getPendingOps() async {
    final database = await db();
    return database.query('sync_queue', orderBy: 'created_at ASC');
  }

  static Future<void> removeOp(String id) async {
    final database = await db();
    await database.delete('sync_queue', where: 'id = ?', whereArgs: [id]);
  }

  // Cache students locally for offline access
  static Future<void> cacheStudents(List<Map<String, dynamic>> students) async {
    final database = await db();
    await database.delete('local_students');
    for (final s in students) {
      await database.insert('local_students', {
        ...s,
        'cached_at': DateTime.now().toIso8601String(),
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
  }

  static Future<List<Map<String, dynamic>>> getCachedStudents(String classId) async {
    final database = await db();
    return database.query('local_students', where: 'class_id = ?', whereArgs: [classId]);
  }

  // Save attendance locally (offline-first)
  static Future<void> saveAttendanceLocal(List<Map<String, dynamic>> records) async {
    final database = await db();
    for (final r in records) {
      await database.insert('local_attendance', {
        ...r,
        'id': '${r['student_id']}_${r['attendance_date']}',
        'synced': 0,
        'created_at': DateTime.now().toIso8601String(),
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
  }

  // Cache bus mappings for offline driver route list
  static Future<void> cacheBusMappings(List<Map<String, dynamic>> mappings) async {
    final database = await db();
    await database.delete('local_bus_mappings');
    for (final m in mappings) {
      await database.insert('local_bus_mappings', {
        ...m,
        'cached_at': DateTime.now().toIso8601String(),
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
  }

  static Future<List<Map<String, dynamic>>> getCachedBusMappings(String busId) async {
    final database = await db();
    return database.query('local_bus_mappings', where: 'bus_id = ?', whereArgs: [busId]);
  }

  static Future<void> updateBoardingStatus(String mappingId, String status) async {
    final database = await db();
    await database.update(
      'local_bus_mappings',
      {'boarding_status': status, 'boarding_time': DateTime.now().toIso8601String()},
      where: 'id = ?', whereArgs: [mappingId],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SYNC SERVICE — background sync when connectivity is restored
// ─────────────────────────────────────────────────────────────────────────

class SyncService {
  static final SyncService _instance = SyncService._();
  factory SyncService() => _instance;
  SyncService._();

  bool _syncing = false;
  final _statusController = StreamController<SyncStatus>.broadcast();
  Stream<SyncStatus> get statusStream => _statusController.stream;

  void init() {
    // Listen to connectivity changes
    Connectivity().onConnectivityChanged.listen((result) {
      if (result != ConnectivityResult.none) {
        sync();
      }
    });
    // Initial sync attempt
    sync();
    // Periodic retry every 30 seconds
    Timer.periodic(Duration(seconds: 30), (_) => sync());
  }

  Future<void> sync() async {
    if (_syncing) return;
    _syncing = true;
    _statusController.add(SyncStatus(syncing: true, pending: await _pendingCount()));

    try {
      final ops = await LocalDatabase.getPendingOps();
      for (final op in ops) {
        final payload = jsonDecode(op['payload'] as String) as Map<String, dynamic>;
        try {
          await _syncOp(op['table_name'] as String, op['operation'] as String, payload);
          await LocalDatabase.removeOp(op['id'] as String);
        } catch (e) {
          // Will retry on next cycle
          break;
        }
      }
      _statusController.add(SyncStatus(syncing: false, pending: 0, lastSync: DateTime.now()));
    } finally {
      _syncing = false;
      _statusController.add(SyncStatus(syncing: false, pending: await _pendingCount()));
    }
  }

  Future<void> _syncOp(String table, String operation, Map<String, dynamic> payload) async {
    final supabase = Supabase.instance.client;
    switch (operation) {
      case 'insert':
        await supabase.from(table).insert(payload);
        break;
      case 'update':
        final id = payload.remove('id');
        await supabase.from(table).update(payload).eq('id', id as String);
        break;
      case 'delete':
        await supabase.from(table).delete().eq('id', payload['id'] as String);
        break;
    }
  }

  Future<int> _pendingCount() async {
    final ops = await LocalDatabase.getPendingOps();
    return ops.length;
  }

  void dispose() => _statusController.close();
}

class SyncStatus {
  final bool syncing;
  final int pending;
  final DateTime? lastSync;
  SyncStatus({required this.syncing, required this.pending, this.lastSync});
}

// ─────────────────────────────────────────────────────────────────────────
// TEACHER SCREEN — photo grid attendance with QR scan
// ─────────────────────────────────────────────────────────────────────────

class TeacherAttendanceScreen extends StatefulWidget {
  final String classId;
  final String className;
  const TeacherAttendanceScreen({required this.classId, required this.className, super.key});

  @override
  State<TeacherAttendanceScreen> createState() => _TeacherAttendanceScreenState();
}

class _TeacherAttendanceScreenState extends State<TeacherAttendanceScreen> {
  List<Map<String, dynamic>> _students = [];
  Map<String, String> _attendance = {}; // studentId -> status
  bool _loading = true;
  bool _saving = false;
  bool _scanMode = false;
  final _scannerController = MobileScannerController();

  @override
  void initState() {
    super.initState();
    _loadStudents();
  }

  Future<void> _loadStudents() async {
    // Try server first; fall back to local cache
    try {
      final supabase = Supabase.instance.client;
      final data = await supabase
          .from('students')
          .select('*, guardians(full_name, phone)')
          .eq('class_id', widget.classId)
          .order('full_name');
      final students = List<Map<String, dynamic>>.from(data);
      await LocalDatabase.cacheStudents(students);
      setState(() {
        _students = students;
        for (final s in students) {
          _attendance[s['id']] = 'Present';
        }
        _loading = false;
      });
    } catch (_) {
      // Offline — use cached data
      final cached = await LocalDatabase.getCachedStudents(widget.classId);
      setState(() {
        _students = cached;
        for (final s in cached) {
          _attendance[s['id']] = 'Present';
        }
        _loading = false;
      });
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final date = DateTime.now().toIso8601String().split('T')[0];
    final records = _students.map((s) => {
      'student_id': s['id'],
      'class_id': widget.classId,
      'attendance_date': date,
      'status': _attendance[s['id']] ?? 'Present',
    }).toList();

    // Always save locally first (offline-first)
    await LocalDatabase.saveAttendanceLocal(records);

    // Try to sync immediately if online
    final connectivity = await Connectivity().checkConnectivity();
    if (connectivity != ConnectivityResult.none) {
      try {
        final supabase = Supabase.instance.client;
        await supabase.from('student_attendance').delete()
            .eq('class_id', widget.classId).eq('attendance_date', date);
        await supabase.from('student_attendance').insert(records);
      } catch (_) {
        // Queue for background sync
        for (final r in records) {
          await LocalDatabase.enqueue('student_attendance', 'insert', r);
        }
      }
    } else {
      for (final r in records) {
        await LocalDatabase.enqueue('student_attendance', 'insert', r);
      }
    }

    setState(() => _saving = false);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Attendance saved ${records.length} students')),
      );
    }
  }

  void _onQrDetected(BarcodeCapture capture) {
    final barcode = capture.barcodes.first;
    final text = barcode.rawValue ?? '';
    final admissionNo = text.startsWith('STUDENT:') ? text.substring(8) : text;
    final student = _students.where((s) => s['admission_no'] == admissionNo).firstOrNull;
    if (student != null) {
      setState(() {
        _attendance[student['id']] = 'Present';
        _scanMode = false;
      });
      _scannerController.stop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Marked present: ${student['full_name']}')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return Center(child: CircularProgressIndicator());

    return Scaffold(
      appBar: AppBar(
        title: Text('Attendance — ${widget.className}'),
        actions: [
          IconButton(
            icon: Icon(Icons.qr_code_scanner),
            onPressed: () => setState(() => _scanMode = true),
          ),
          IconButton(icon: Icon(Icons.save), onPressed: _saving ? null : _save),
        ],
      ),
      body: _scanMode
          ? MobileScanner(
              controller: _scannerController,
              onDetect: _onQrDetected,
            )
          : GridView.builder(
              padding: EdgeInsets.all(8),
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: MediaQuery.of(context).size.width > 600 ? 4 : 2,
                childAspectRatio: 0.75,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
              ),
              itemCount: _students.length,
              itemBuilder: (context, index) {
                final s = _students[index];
                final status = _attendance[s['id']] ?? 'Present';
                return _StudentPhotoCard(
                  name: s['full_name'],
                  admissionNo: s['admission_no'],
                  photoUrl: s['photo_url'],
                  status: status,
                  onTap: () {
                    setState(() {
                      _attendance[s['id']] = status == 'Present' ? 'Absent' : 'Present';
                    });
                  },
                );
              },
            ),
    );
  }
}

class _StudentPhotoCard extends StatelessWidget {
  final String name;
  final String admissionNo;
  final String? photoUrl;
  final String status;
  final VoidCallback onTap;

  const _StudentPhotoCard({
    required this.name,
    required this.admissionNo,
    this.photoUrl,
    required this.status,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final statusColor = status == 'Present' ? Colors.green : Colors.red;
    return GestureDetector(
      onTap: onTap,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            Expanded(
              child: Stack(
                children: [
                  photoUrl != null
                      ? Image.network(photoUrl!, fit: BoxFit.cover, width: double.infinity)
                      : Container(
                          color: Colors.blue.shade100,
                          child: Center(
                            child: Text(name[0].toUpperCase(), style: TextStyle(fontSize: 32, color: Colors.white)),
                          ),
                        ),
                  Positioned(
                    top: 4, right: 4,
                    child: Container(
                      padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: statusColor, borderRadius: BorderRadius.circular(10)),
                      child: Text(status, style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: EdgeInsets.all(6),
              child: Column(
                children: [
                  Text(name, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
                  Text(admissionNo, style: TextStyle(fontSize: 10, color: Colors.grey)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// DRIVER SCREEN — route student list + QR boarding + emergency call
// ─────────────────────────────────────────────────────────────────────────

class DriverRouteScreen extends StatefulWidget {
  final String busId;
  final String busNo;
  const DriverRouteScreen({required this.busId, required this.busNo, super.key});

  @override
  State<DriverRouteScreen> createState() => _DriverRouteScreenState();
}

class _DriverRouteScreenState extends State<DriverRouteScreen> {
  List<Map<String, dynamic>> _mappings = [];
  bool _loading = true;
  bool _scanMode = false;
  bool _tripActive = false;
  final _scannerController = MobileScannerController();

  static const _emergencyContacts = [
    {'name': 'School Office', 'phone': '+911234567890'},
    {'name': 'Transport Incharge', 'phone': '+919876543210'},
    {'name': 'Ambulance / 108', 'phone': '108'},
  ];

  @override
  void initState() {
    super.initState();
    _loadMappings();
  }

  Future<void> _loadMappings() async {
    try {
      final supabase = Supabase.instance.client;
      final data = await supabase
          .from('student_bus_mappings')
          .select('*, students(full_name, admission_no, photo_url), buses(bus_no), bus_routes(route_name)')
          .eq('bus_id', widget.busId);
      final mappings = List<Map<String, dynamic>>.from(data);
      await LocalDatabase.cacheBusMappings(mappings);
      setState(() { _mappings = mappings; _loading = false; });
    } catch (_) {
      final cached = await LocalDatabase.getCachedBusMappings(widget.busId);
      setState(() { _mappings = cached; _loading = false; });
    }
  }

  void _onQrDetected(BarcodeCapture capture) {
    final text = capture.barcodes.first.rawValue ?? '';
    final admissionNo = text.startsWith('STUDENT:') ? text.substring(8) : text;
    final mapping = _mappings.where((m) {
      final student = m['students'] as Map<String, dynamic>?;
      return student?['admission_no'] == admissionNo;
    }).firstOrNull;
    if (mapping != null) {
      final currentStatus = mapping['boarding_status'] ?? 'pending';
      final nextStatus = currentStatus == 'pending' ? 'boarded'
          : currentStatus == 'boarded' ? 'deboarded' : 'boarded';
      LocalDatabase.updateBoardingStatus(mapping['id'], nextStatus);
      LocalDatabase.enqueue('student_bus_mappings', 'update', {
        'id': mapping['id'],
        'boarding_status': nextStatus,
        'boarding_time': DateTime.now().toIso8601String(),
      });
      setState(() {
        mapping['boarding_status'] = nextStatus;
      });
    }
  }

  void _showEmergencyDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(children: [Icon(Icons.warning, color: Colors.red), SizedBox(width: 8), Text('Emergency Call')]),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: _emergencyContacts.map((c) => ListTile(
            leading: CircleAvatar(child: Icon(Icons.phone, color: Colors.red)),
            title: Text(c['name']!),
            subtitle: Text(c['phone']!),
            onTap: () {
              // Launch phone call via url_launcher
            },
          )).toList(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return Center(child: CircularProgressIndicator());

    return Scaffold(
      appBar: AppBar(
        title: Text('Route — ${widget.busNo}'),
        actions: [
          IconButton(icon: Icon(Icons.qr_code_scanner), onPressed: () => setState(() => _scanMode = true)),
        ],
      ),
      body: _scanMode
          ? MobileScanner(controller: _scannerController, onDetect: _onQrDetected)
          : Column(
              children: [
                // Trip controls
                Padding(
                  padding: EdgeInsets.all(12),
                  child: Row(
                    children: [
                      ElevatedButton(
                        onPressed: () => setState(() => _tripActive = true),
                        child: Text('Start Trip'),
                      ),
                      SizedBox(width: 8),
                      ElevatedButton(
                        onPressed: () => setState(() => _tripActive = false),
                        style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
                        child: Text('End Trip'),
                      ),
                      Spacer(),
                      FloatingActionButton(
                        onPressed: _showEmergencyDialog,
                        backgroundColor: Colors.red,
                        child: Icon(Icons.warning),
                      ),
                    ],
                  ),
                ),
                // Student list
                Expanded(
                  child: ListView.builder(
                    itemCount: _mappings.length,
                    itemBuilder: (context, index) {
                      final m = _mappings[index];
                      final student = m['students'] as Map<String, dynamic>?;
                      final status = m['boarding_status'] ?? 'pending';
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundImage: student?['photo_url'] != null
                              ? NetworkImage(student!['photo_url'])
                              : null,
                          child: student?['photo_url'] == null
                              ? Text(student?['full_name']?[0] ?? '?')
                              : null,
                        ),
                        title: Text(student?['full_name'] ?? '—'),
                        subtitle: Text('${student?['admission_no'] ?? ''} · ${m['pickup_point'] ?? '—'}'),
                        trailing: Container(
                          padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: status == 'boarded' ? Colors.green : status == 'deboarded' ? Colors.blue : Colors.grey,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(status, style: TextStyle(color: Colors.white, fontSize: 11)),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
    );
  }
}
