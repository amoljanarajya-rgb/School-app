// .NET MAUI — Teacher & Driver Mobile Portal with Offline Sync
// Reference implementation for native Android / iOS / Windows.
//
// NuGet packages required:
//   supabase-csharp-community    # Supabase client
//   sqlite-net-pcl               # Local SQLite database
//   ZXing.Net.Maui               # QR / barcode scanning via camera
//   Plugin.Maui.Camera           # Camera access for document scanning
//   Plugin.CurrentActivity       # Android connectivity
//
// Register in MauiProgram.cs:
//   builder.UseMauiApp<App>()
//     .UseBarcodeReader()       // ZXing.Net.Maui
//     .UseCamera();             // Plugin.Maui.Camera
//
// This file provides the SQLite local database, sync service, and the
// Teacher + Driver ContentPage implementations.

using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Tasks;
using SQLite;
using Xamarin.Essentials;

namespace SchoolErp.Mobile;

// ─────────────────────────────────────────────────────────────────────────
// LOCAL DATABASE (SQLite) — offline-first data store
// ─────────────────────────────────────────────────────────────────────────

public class LocalDatabase
{
    private readonly SQLiteAsyncConnection _connection;

    public LocalDatabase(string dbPath)
    {
        _connection = new SQLiteAsyncConnection(dbPath);
        _connection.CreateTableAsync<SyncQueueItem>().Wait();
        _connection.CreateTableAsync<LocalStudent>().Wait();
        _connection.CreateTableAsync<LocalBusMapping>().Wait();
        _connection.CreateTableAsync<LocalAttendance>().Wait();
    }

    // Sync queue
    public Task<int> EnqueueAsync(string table, string operation, string payloadJson)
    {
        return _connection.InsertAsync(new SyncQueueItem
        {
            Id = Guid.NewGuid().ToString(),
            TableName = table,
            Operation = operation,
            Payload = payloadJson,
            CreatedAt = DateTime.UtcNow,
        });
    }

    public Task<List<SyncQueueItem>> GetPendingOpsAsync()
    {
        return _connection.Table<SyncQueueItem>().OrderBy(x => x.CreatedAt).ToListAsync();
    }

    public Task<int> RemoveOpAsync(string id) => _connection.DeleteAsync<SyncQueueItem>(id);

    // Student cache
    public Task<int> CacheStudentsAsync(IEnumerable<LocalStudent> students)
    {
        _connection.DeleteAllAsync<LocalStudent>().Wait();
        return _connection.InsertAllAsync(students);
    }

    public Task<List<LocalStudent>> GetCachedStudentsAsync(string classId)
    {
        return _connection.Table<LocalStudent>().Where(s => s.ClassId == classId).ToListAsync();
    }

    // Attendance (offline-first)
    public Task<int> SaveAttendanceLocalAsync(LocalAttendance record)
    {
        return _connection.InsertOrReplaceAsync(record);
    }

    // Bus mappings cache
    public Task<int> CacheBusMappingsAsync(IEnumerable<LocalBusMapping> mappings)
    {
        _connection.DeleteAllAsync<LocalBusMapping>().Wait();
        return _connection.InsertAllAsync(mappings);
    }

    public Task<List<LocalBusMapping>> GetCachedBusMappingsAsync(string busId)
    {
        return _connection.Table<LocalBusMapping>().Where(m => m.BusId == busId).ToListAsync();
    }

    public Task<int> UpdateBoardingStatusAsync(string mappingId, string status)
    {
        return _connection.ExecuteAsync(
            "UPDATE LocalBusMapping SET BoardingStatus = ?, BoardingTime = ? WHERE Id = ?",
            status, DateTime.UtcNow, mappingId);
    }
}

[Table("SyncQueue")]
public class SyncQueueItem
{
    [PrimaryKey] public string Id { get; set; } = "";
    public string TableName { get; set; } = "";
    public string Operation { get; set; } = "";
    public string Payload { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public int Attempts { get; set; }
    public string? LastError { get; set; }
}

[Table("LocalStudent")]
public class LocalStudent
{
    [PrimaryKey] public string Id { get; set; } = "";
    public string AdmissionNo { get; set; } = "";
    public string FullName { get; set; } = "";
    public string ClassId { get; set; } = "";
    public string? SectionId { get; set; }
    public int? RollNo { get; set; }
    public string? PhotoUrl { get; set; }
    public string? GuardianPhone { get; set; }
    public DateTime CachedAt { get; set; }
}

[Table("LocalAttendance")]
public class LocalAttendance
{
    [PrimaryKey] public string Id { get; set; } = ""; // studentId_date
    public string StudentId { get; set; } = "";
    public string ClassId { get; set; } = "";
    public string? SectionId { get; set; }
    public string AttendanceDate { get; set; } = "";
    public string Status { get; set; } = "Present";
    public bool Synced { get; set; }
    public DateTime CreatedAt { get; set; }
}

[Table("LocalBusMapping")]
public class LocalBusMapping
{
    [PrimaryKey] public string Id { get; set; } = "";
    public string StudentId { get; set; } = "";
    public string BusId { get; set; } = "";
    public string? RouteId { get; set; }
    public string? PickupPoint { get; set; }
    public string StudentName { get; set; } = "";
    public string AdmissionNo { get; set; } = "";
    public string? PhotoUrl { get; set; }
    public string BoardingStatus { get; set; } = "pending";
    public DateTime? BoardingTime { get; set; }
    public DateTime CachedAt { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────
// SYNC SERVICE — background sync when connectivity is restored
// ─────────────────────────────────────────────────────────────────────────

public class SyncService : INotifyPropertyChanged
{
    private readonly LocalDatabase _db;
    private readonly SupabaseClient _supabase;
    private bool _syncing;
    private int _pending;

    public bool IsSyncing
    {
        get => _syncing;
        private set { _syncing = value; OnPropertyChanged(); }
    }

    public int PendingCount
    {
        get => _pending;
        private set { _pending = value; OnPropertyChanged(); }
    }

    public SyncService(LocalDatabase db, SupabaseClient supabase)
    {
        _db = db;
        _supabase = supabase;
        Connectivity.ConnectivityChanged += OnConnectivityChanged;
        Task.Run(SyncAsync);
        // Periodic retry
        Device.StartTimer(TimeSpan.FromSeconds(30), () =>
        {
            _ = SyncAsync();
            return true;
        });
    }

    private async void OnConnectivityChanged(object? sender, ConnectivityChangedEventArgs e)
    {
        if (e.NetworkAccess != NetworkAccess.None)
            await SyncAsync();
    }

    public async Task SyncAsync()
    {
        if (IsSyncing) return;
        IsSyncing = true;
        try
        {
            var ops = await _db.GetPendingOpsAsync();
            PendingCount = ops.Count;
            foreach (var op in ops)
            {
                try
                {
                    await SyncOpAsync(op);
                    await _db.RemoveOpAsync(op.Id);
                    PendingCount--;
                }
                catch
                {
                    break; // retry on next cycle
                }
            }
        }
        finally
        {
            IsSyncing = false;
        }
    }

    private async Task SyncOpAsync(SyncQueueItem op)
    {
        var payload = JsonDocument.Parse(op.Payload).RootElement;
        switch (op.Operation)
        {
            case "insert":
                await _supabase.From<object>(op.TableName).Insert(payload);
                break;
            case "update":
                var id = payload.GetProperty("id").GetString()!;
                await _supabase.From<object>(op.TableName)
                    .Where(x => x.GetColumn("id") == id)
                    .Update(payload);
                break;
            case "delete":
                var delId = payload.GetProperty("id").GetString()!;
                await _supabase.From<object>(op.TableName)
                    .Where(x => x.GetColumn("id") == delId)
                    .Delete();
                break;
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected virtual void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}

// ─────────────────────────────────────────────────────────────────────────
// TEACHER PAGE — photo grid attendance + QR scan
// ─────────────────────────────────────────────────────────────────────────

public class TeacherAttendanceViewModel : INotifyPropertyChanged
{
    private readonly LocalDatabase _db;
    private readonly SupabaseClient _supabase;
    private readonly string _classId;

    public ObservableCollection<StudentAttendanceItem> Students { get; } = new();
    public bool IsBusy { get; private set; }
    public bool IsSaving { get; private set; }

    public TeacherAttendanceViewModel(LocalDatabase db, SupabaseClient supabase, string classId)
    {
        _db = db;
        _supabase = supabase;
        _classId = classId;
    }

    public async Task LoadStudentsAsync()
    {
        IsBusy = true;
        try
        {
            // Try server first
            var remote = await _supabase.From<Dictionary<string, object>>("students")
                .Where(x => x.GetColumn("class_id") == _classId)
                .Get();
            // Cache locally
            // ... (map to LocalStudent and cache)
            foreach (var s in remote.Models)
            {
                Students.Add(new StudentAttendanceItem
                {
                    Id = s["id"].ToString(),
                    Name = s["full_name"].ToString(),
                    AdmissionNo = s["admission_no"].ToString(),
                    PhotoUrl = s.TryGetValue("photo_url", out var url) ? url?.ToString() : null,
                    Status = "Present",
                });
            }
        }
        catch
        {
            // Offline — load from cache
            var cached = await _db.GetCachedStudentsAsync(_classId);
            foreach (var s in cached)
            {
                Students.Add(new StudentAttendanceItem
                {
                    Id = s.Id,
                    Name = s.FullName,
                    AdmissionNo = s.AdmissionNo,
                    PhotoUrl = s.PhotoUrl,
                    Status = "Present",
                });
            }
        }
        finally { IsBusy = false; }
    }

    public async Task SaveAsync()
    {
        IsSaving = true;
        var date = DateTime.Today.ToString("yyyy-MM-dd");
        foreach (var s in Students)
        {
            var record = new LocalAttendance
            {
                Id = $"{s.Id}_{date}",
                StudentId = s.Id,
                ClassId = _classId,
                AttendanceDate = date,
                Status = s.Status,
                Synced = false,
                CreatedAt = DateTime.UtcNow,
            };
            await _db.SaveAttendanceLocalAsync(record);
            // Queue for sync
            await _db.EnqueueAsync("student_attendance", "insert",
                JsonSerializer.Serialize(new { student_id = s.Id, class_id = _classId, attendance_date = date, status = s.Status }));
        }
        IsSaving = false;
    }

    public void OnQrScanned(string qrText)
    {
        var admissionNo = qrText.StartsWith("STUDENT:") ? qrText[8..] : qrText;
        var student = Students.FirstOrDefault(s => s.AdmissionNo == admissionNo);
        if (student != null)
        {
            student.Status = "Present";
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;
}

public class StudentAttendanceItem : INotifyPropertyChanged
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string AdmissionNo { get; set; } = "";
    public string? PhotoUrl { get; set; }

    private string _status = "Present";
    public string Status
    {
        get => _status;
        set { _status = value; PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Status))); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;
}

// ─────────────────────────────────────────────────────────────────────────
// DRIVER PAGE — route student list + QR boarding + emergency call
// ─────────────────────────────────────────────────────────────────────────

public class DriverRouteViewModel : INotifyPropertyChanged
{
    private readonly LocalDatabase _db;
    private readonly SupabaseClient _supabase;
    private readonly string _busId;
    private bool _tripActive;

    public ObservableCollection<BoardingItem> Mappings { get; } = new();
    public bool TripActive
    {
        get => _tripActive;
        set { _tripActive = value; PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(TripActive))); }
    }

    public static IReadOnlyList<EmergencyContact> EmergencyContacts { get; } = new List<EmergencyContact>
    {
        new("School Office", "+911234567890"),
        new("Transport Incharge", "+919876543210"),
        new("Principal", "+919812345678"),
        new("Ambulance / 108", "108"),
    };

    public DriverRouteViewModel(LocalDatabase db, SupabaseClient supabase, string busId)
    {
        _db = db;
        _supabase = supabase;
        _busId = busId;
    }

    public async Task LoadMappingsAsync()
    {
        try
        {
            // Try server
            var remote = await _supabase.From<Dictionary<string, object>>("student_bus_mappings")
                .Where(x => x.GetColumn("bus_id") == _busId)
                .Get();
            foreach (var m in remote.Models)
            {
                Mappings.Add(new BoardingItem
                {
                    Id = m["id"].ToString(),
                    StudentName = m.TryGetValue("student_name", out var n) ? n?.ToString() ?? "" : "",
                    AdmissionNo = m.TryGetValue("admission_no", out var a) ? a?.ToString() ?? "" : "",
                    PickupPoint = m.TryGetValue("pickup_point", out var p) ? p?.ToString() : null,
                    BoardingStatus = "pending",
                });
            }
        }
        catch
        {
            // Offline — cached
            var cached = await _db.GetCachedBusMappingsAsync(_busId);
            foreach (var m in cached)
            {
                Mappings.Add(new BoardingItem
                {
                    Id = m.Id,
                    StudentName = m.StudentName,
                    AdmissionNo = m.AdmissionNo,
                    PickupPoint = m.PickupPoint,
                    BoardingStatus = m.BoardingStatus,
                });
            }
        }
    }

    public async Task OnQrScannedAsync(string qrText)
    {
        var admissionNo = qrText.StartsWith("STUDENT:") ? qrText[8..] : qrText;
        var item = Mappings.FirstOrDefault(m => m.AdmissionNo == admissionNo);
        if (item == null) return;

        var nextStatus = item.BoardingStatus switch
        {
            "pending" => "boarded",
            "boarded" => "deboarded",
            _ => "boarded",
        };

        item.BoardingStatus = nextStatus;
        await _db.UpdateBoardingStatusAsync(item.Id, nextStatus);
        await _db.EnqueueAsync("student_bus_mappings", "update",
            JsonSerializer.Serialize(new { id = item.Id, boarding_status = nextStatus, boarding_time = DateTime.UtcNow }));
    }

    public event PropertyChangedEventHandler? PropertyChanged;
}

public class BoardingItem : INotifyPropertyChanged
{
    public string Id { get; set; } = "";
    public string StudentName { get; set; } = "";
    public string AdmissionNo { get; set; } = "";
    public string? PickupPoint { get; set; }
    public string? PhotoUrl { get; set; }

    private string _boardingStatus = "pending";
    public string BoardingStatus
    {
        get => _boardingStatus;
        set { _boardingStatus = value; PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(BoardingStatus))); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;
}

public record EmergencyContact(string Name, string Phone);
