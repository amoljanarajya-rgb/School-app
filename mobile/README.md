# Yug International School ERP — Mobile App (Teacher & Driver Portal)

Native mobile app for teachers and bus drivers, with offline-first data sync.

## Architecture

```
┌──────────────────────────────────────────────┐
│  Mobile App (Flutter / .NET MAUI)            │
│                                              │
│  ┌─────────────┐    ┌────────────────────┐  │
│  │ Teacher     │    │ Driver             │  │
│  │ Portal      │    │ Portal             │  │
│  │ - Photo grid│    │ - Route list       │  │
│  │ - QR scan   │    │ - QR boarding      │  │
│  │ - Offline   │    │ - Emergency call   │  │
│  └──────┬──────┘    └────────┬───────────┘  │
│         │                     │              │
│  ┌──────▼─────────────────────▼───────────┐  │
│  │  SQLite Local Database                 │  │
│  │  - student_attendance (offline-first)  │  │
│  │  - bus_mappings + boarding_status      │  │
│  │  - sync_queue (pending operations)     │  │
│  └──────┬─────────────────────────────────┘  │
│         │ Background Sync Service            │
│  ┌──────▼─────────────────────────────────┐  │
│  │  Sync Engine                           │  │
│  │  - connectivity_plus listener          │  │
│  │  - 30s periodic retry                  │  │
│  │  - flushes sync_queue → Supabase       │  │
│  └──────┬─────────────────────────────────┘  │
└─────────┼────────────────────────────────────┘
          │ HTTPS
   ┌──────▼──────┐
   │  Supabase   │
   │  (Postgres) │
   └─────────────┘
```

## Features

### Teacher Portal
- Class-wise attendance marking with student photo grid
- QR scan student ID cards for instant present-marking
- Bulk "All Present" / "All Absent" toggles
- Offline attendance saves to local SQLite; syncs when online

### Driver Portal
- Route student list with pickup points
- QR scan for boarding/deboarding checklist (scan toggles pending → boarded → deboarded)
- Trip start/end tracking with timestamps
- Emergency call button with one-tap dial to school office, transport incharge, principal, ambulance

### Offline Sync
- All operations are written to the local SQLite database first
- A background sync service monitors connectivity and flushes the sync queue to Supabase
- Periodic 30-second retry ensures data is synced even if the app stays open
- Sync status banner shows pending record count and last sync time

### Camera & Document Scanning
- QR scanning via `mobile_scanner` (Flutter) / `ZXing.Net.Maui` (.NET MAUI)
- Document scanner for fee receipt vouchers and exam hall ticket attachments
- Photos uploaded to Supabase Storage

## Flutter Implementation

See `flutter/teacher_driver_portal.dart` for the complete reference.

### pubspec.yaml dependencies
```yaml
dependencies:
  supabase_flutter: ^2.0.0
  sqflite: ^2.3.0
  mobile_scanner: ^5.0.0
  camera: ^0.11.0
  path_provider: ^2.1.0
  connectivity_plus: ^6.0.0
  image_picker: ^1.1.0
  url_launcher: ^6.2.0
```

### Initialization
```dart
void main() async {
  await Supabase.initialize(url: 'YOUR_URL', anonKey: 'YOUR_KEY');
  SyncService().init();  // Start background sync
  runApp(SchoolErpApp());
}
```

## .NET MAUI Implementation

See `dotnet-maui/TeacherDriverPortal.cs` for the complete reference.

### NuGet packages
```
supabase-csharp-community
sqlite-net-pcl
ZXing.Net.Maui
Plugin.Maui.Camera
Xamarin.Essentials
```

### MauiProgram.cs
```csharp
builder.UseMauiApp<App>()
    .UseBarcodeReader()
    .UseCamera();
builder.Services.AddSingleton<LocalDatabase>();
builder.Services.AddSingleton<SyncService>();
```
