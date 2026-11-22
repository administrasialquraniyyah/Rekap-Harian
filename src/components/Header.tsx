import React, { useState } from 'react';
import { Menu, Database, ShieldCheck, LogOut, User as UserIcon, Monitor, Smartphone, ExternalLink, Clock, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { SDIT_PORTAL_URL } from '../lib/crossDatabase';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onToggleSidebar: () => void;
  isSidebarCollapsed?: boolean;
  isDesktopMode?: boolean;
  onToggleDesktopMode?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onToggleSidebar,
  isSidebarCollapsed,
  isDesktopMode = false,
  onToggleDesktopMode,
}) => {
  const { user, signOut } = useAuth();
  const [showBpiModal, setShowBpiModal] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-2.5 sm:px-6 py-2 sm:py-3 flex items-center justify-between shadow-xs">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 sm:p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-emerald-900 transition flex items-center gap-1.5 shrink-0"
          aria-label="Toggle menu"
          title={isSidebarCollapsed ? "Tampilkan Menu Samping" : "Sembunyikan Menu Samping"}
        >
          <Menu className="w-5 h-5 text-emerald-900" />
          <span className="hidden sm:inline text-xs font-bold text-emerald-950">
            {isSidebarCollapsed ? "Buka Menu" : "Menu"}
          </span>
        </button>

        <div className="min-w-0">
          <h2 className="text-sm sm:text-lg font-bold text-slate-800 tracking-tight leading-tight truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium hidden sm:block truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Toggle Mode Desktop (PC View) on HP / Tablet */}
        {onToggleDesktopMode && (
          <button
            onClick={onToggleDesktopMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition border shadow-xs ${
              isDesktopMode
                ? 'bg-emerald-900 text-amber-300 border-emerald-950 hover:bg-emerald-850'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title={isDesktopMode ? "Kembali ke Tampilan HP" : "Beralih ke Tampilan Desktop/PC (Lebar & Padat)"}
          >
            {isDesktopMode ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-[11px]">Mode PC (Aktif)</span>
              </>
            ) : (
              <>
                <Monitor className="w-3.5 h-3.5 text-emerald-800" />
                <span className="text-[11px]">Mode PC</span>
              </>
            )}
          </button>
        )}

        {/* Supabase Status Pill */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
            isSupabaseConfigured
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
          title={isSupabaseConfigured ? 'Database Supabase Terhubung' : 'Konfigurasi Supabase Diperlukan'}
        >
          <Database className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {isSupabaseConfigured ? 'Supabase Online' : 'Mode Offline/Setup'}
          </span>
          <span
            className={`w-2 h-2 rounded-full ${
              isSupabaseConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          />
        </div>

        {/* BPI Maja Auto-Sync Pill & Modal Trigger */}
        <button
          onClick={() => setShowBpiModal(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition border border-emerald-950 bg-emerald-900 text-amber-300 hover:bg-emerald-850 shadow-xs cursor-pointer"
          title="Klik untuk melihat Status & Jadwal Sinkronisasi Otomatis BPI Maja"
        >
          <Clock className="w-3.5 h-3.5 text-amber-300" />
          <span className="text-[11px] font-bold whitespace-nowrap">BPI: Auto 08:00</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </button>

        {/* Switcher ke Portal TK & SD IT */}
        <a
          href={SDIT_PORTAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 shadow-2xs"
          title="Buka Aplikasi Keuangan Unit TK & SD IT Al-Qur'aniyyah"
        >
          <ExternalLink className="w-3.5 h-3.5 text-amber-700" />
          <span className="text-[11px] whitespace-nowrap">Portal TK &amp; SD IT</span>
        </a>

        {/* User Info & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className="hidden md:block text-left">
              <p className="font-semibold text-slate-800 leading-tight">
                {user?.user_metadata?.full_name || 'Nasrulloh'}
              </p>
              <p className="text-[10px] text-emerald-800 font-bold">Bendahara Al-Qur'aniyyah</p>
            </div>
          </div>

          <button
            onClick={() => signOut()}
            title="Keluar"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Modal Dialog Info Integrasi BPI Maja */}
      {showBpiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-linear-to-r from-emerald-950 to-emerald-900 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-tight">Sinkronisasi BPI Maja</h3>
                  <p className="text-[11px] text-emerald-200">Integrasi Otomatis Pembayaran Siswa</p>
                </div>
              </div>
              <button
                onClick={() => setShowBpiModal(false)}
                className="p-1 text-emerald-300 hover:text-white rounded-lg hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-600">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-emerald-950">Status Integrasi: AKTIF</p>
                  <p className="text-[11px] text-emerald-850 leading-relaxed">
                    Cloud Worker terjadwal otomatis di GitHub Actions untuk mengambil transaksi mutasi BPI Maja setiap pagi.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Jadwal Harian</p>
                  <p className="font-bold text-slate-800 text-xs mt-0.5">Pukul 08:00 WIB</p>
                  <p className="text-[10px] text-slate-500">Setiap hari (Otomatis)</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Anti-Duplikat</p>
                  <p className="font-bold text-emerald-700 text-xs mt-0.5">Idempotensi Aktif</p>
                  <p className="text-[10px] text-slate-500">Cegah input ganda</p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <p className="font-bold text-slate-700">Metode Kerja Sinkronisasi:</p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                  <li>Login otomatis ke <span className="font-mono text-emerald-800">bpi.maja.id/payment</span>.</li>
                  <li>Mencocokkan transaksi siswa via NIS dan Nama.</li>
                  <li>Transaksi langsung masuk ke Supabase &amp; Rekap Harian.</li>
                </ul>
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                <a
                  href="https://github.com/administrasialquraniyyah/Rekap-Harian/actions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-900 text-amber-300 font-bold rounded-xl hover:bg-emerald-850 transition shadow-xs text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Jalankan Manual (GitHub)</span>
                </a>
                <button
                  onClick={() => setShowBpiModal(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl transition text-xs"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
