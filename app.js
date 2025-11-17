// ============ State & Storage ============
const STORAGE_KEY = 'thrivve-tracker-v3-state';

let state = {
  rules: {
    minHours: 25,
    minTrips: 35,
    minPeakTripsPercent: 70,
    incentivePerTrip: 3
  },
  stats: {
    acceptance: null,
    cancel: null
  },
  rides: []
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.rules) state.rules = parsed.rules;
    if (parsed.stats) state.stats = parsed.stats;
    if (Array.isArray(parsed.rides)) state.rides = parsed.rides;
  } catch (e) {
    console.error('Failed to load state', e);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ============ Helpers ============
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ar-SA', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

// تعريف أوقات الذروة حسب كلام ثرايف
function isPeak(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
  const h = d.getHours();
  const m = d.getMinutes();
  const hm = h * 60 + m;

  // Sun-Wed: 06:00 - 19:00
  if (day >= 0 && day <= 3) {
    if (hm >= 6 * 60 && hm < 19 * 60) return true;
  }

  // Thu: 06:00 - 24:00 + Fri 00:00 - 01:00
  if (day === 4 && hm >= 6 * 60) return true; // Thu 06:00 -> midnight
  if (day === 5 && hm < 60) return true;      // Fri 00:00 - 01:00

  // Fri-Sat: 18:00 - 24:00 + next day 00:00 - 01:00
  if (day === 5 && hm >= 18 * 60) return true; // Fri evening
  if (day === 6 && hm < 60) return true;       // Sat 00:00 - 01:00
  if (day === 6 && hm >= 18 * 60) return true; // Sat evening
  if (day === 0 && hm < 60) return true;       // Sun 00:00 - 01:00

  return false;
}

function getWeekInfoText() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun .. 6=Sat
  // Monday as start: 1 = Monday, 0=Sun
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const fmt = (d) =>
    d.toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `الأسبوع الحالي (حسب جهازك): من الإثنين ${fmt(monday)} حتى الأحد ${fmt(sunday)}.`;
}

// ============ Dashboard Calculation ============
function recalcDashboard() {
  const rides = state.rides
    .slice()
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  const totalTrips = rides.length;
  const totalSeconds = rides.reduce((s, r) => s + (r.durationSec || 0), 0);
  const totalHours = totalSeconds / 3600;
  const totalFare = rides.reduce((s, r) => s + (r.fare || 0), 0);
  const totalCash = rides.reduce(
    (s, r) => s + (r.cashPart != null ? r.cashPart : r.payment === 'cash' ? (r.fare || 0) : 0),
    0
  );
  const totalCard = rides.reduce(
    (s, r) =>
      s +
      (r.cardPart != null
        ? r.cardPart
        : r.payment === 'card'
        ? (r.fare || 0)
        : r.payment === 'cash'
        ? 0
        : 0),
    0
  );

  const minHours = Number(state.rules.minHours) || 0;
  const minTrips = Number(state.rules.minTrips) || 0;
  const minPeakPercent = Number(state.rules.minPeakTripsPercent) || 0;
  const incentivePerTrip = Number(state.rules.incentivePerTrip) || 0;

  const acceptance = state.stats.acceptance;
  const cancel = state.stats.cancel;

  // Required trips with progressive rule
  let requiredTrips = minTrips;
  if (totalHours > minHours) {
    const extraHours = totalHours - minHours;
    const extraTrips = Math.ceil(extraHours * 1.5);
    requiredTrips = minTrips + extraTrips;
  }
  const remainingTrips = Math.max(0, requiredTrips - totalTrips);

  // Peak stats
  const peakRides = rides.filter((r) => r.isPeak);
  const peakTripsCount = peakRides.length;
  const peakTripsPercent = totalTrips > 0 ? (peakTripsCount / totalTrips) * 100 : 0;
  const peakTimeSeconds = peakRides.reduce((s, r) => s + (r.durationSec || 0), 0);
  const peakTimePercent = totalSeconds > 0 ? (peakTimeSeconds / totalSeconds) * 100 : 0;

  const totalIncentive = totalTrips * incentivePerTrip;
  const incomeBoostPercent = totalFare > 0 ? (totalIncentive / totalFare) * 100 : null;

  // ---------- Write to DOM ----------
  const weekInfoEl = document.getElementById('weekInfo');
  if (weekInfoEl) weekInfoEl.textContent = getWeekInfoText();

  // Summary cards
  const totalIncentiveEl = document.getElementById('totalIncentive');
  const totalFareEl = document.getElementById('totalFare');
  const incomeBoostEl = document.getElementById('incomeBoost');
  const summaryTripsEl = document.getElementById('summaryTrips');
  const summaryHoursEl = document.getElementById('summaryHours');
  const summaryPeakTripsEl = document.getElementById('summaryPeakTrips');
  const eligibilityBadge = document.getElementById('eligibilityBadge');

  if (totalIncentiveEl) totalIncentiveEl.textContent = totalIncentive.toFixed(2) + ' ر.س';
  if (totalFareEl) totalFareEl.textContent = totalFare.toFixed(2) + ' ر.س';
  if (incomeBoostEl) {
    if (incomeBoostPercent != null) {
      incomeBoostEl.textContent = `نسبة الزيادة الفعلية على الدخل حتى الآن: ${incomeBoostPercent.toFixed(
        1
      )}٪.`;
    } else {
      incomeBoostEl.textContent =
        'أدخل قيم الرحلات لتحسب نسبة الزيادة على الدخل عند تحقق الحافز.';
    }
  }
  if (summaryTripsEl) summaryTripsEl.textContent = totalTrips.toString();
  if (summaryHoursEl) summaryHoursEl.textContent = totalHours.toFixed(2);
  if (summaryPeakTripsEl)
    summaryPeakTripsEl.textContent =
      totalTrips > 0 ? peakTripsPercent.toFixed(1) + '%' : '0%';

  // Hours & trips
  const totalHoursEl = document.getElementById('totalHours');
  const totalTripsEl = document.getElementById('totalTrips');
  const requiredTripsTextEl = document.getElementById('requiredTripsText');
  const remainingTripsTextEl = document.getElementById('remainingTripsText');
  const hoursStatusEl = document.getElementById('hoursStatus');

  if (totalHoursEl) totalHoursEl.textContent = totalHours.toFixed(2);
  if (totalTripsEl) totalTripsEl.textContent = totalTrips.toString();

  if (requiredTripsTextEl) {
    if (totalHours > 0) {
      requiredTripsTextEl.textContent = `الرحلات المطلوبة تقريبًا حسب الشرط: ${requiredTrips} رحلة (معتمد على ${minTrips} أساسية + 1.5 رحلة لكل ساعة فوق ${minHours} ساعة).`;
    } else {
      requiredTripsTextEl.textContent = 'سجّل بعض الرحلات لاحتساب الشرط التصاعدي.';
    }
  }
  if (remainingTripsTextEl) {
    if (totalTrips >= requiredTrips && totalTrips > 0) {
      remainingTripsTextEl.textContent = '✅ عدد الرحلات الحالي يحقق الشرط التصاعدي تقريبًا.';
      remainingTripsTextEl.className = 'text-[11px] text-emerald-400';
    } else if (totalHours > 0) {
      remainingTripsTextEl.textContent = `تحتاج تقريبًا إلى ${remainingTrips} رحلة إضافية لتحقيق الشرط إذا لم تتغير ساعات العمل.`;
      remainingTripsTextEl.className = 'text-[11px] text-amber-300';
    } else {
      remainingTripsTextEl.textContent = '';
    }
  }
  if (hoursStatusEl) {
    if (totalHours >= minHours) {
      hoursStatusEl.textContent = '✅ حققت الحد الأدنى لساعات العمل (تقريبًا).';
      hoursStatusEl.className =
        'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300';
    } else if (totalHours > 0) {
      hoursStatusEl.textContent =
        '⚠ تحت الحد الأدنى للساعات، ما زال بإمكانك زيادة ساعات العمل.';
      hoursStatusEl.className =
        'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300';
    } else {
      hoursStatusEl.textContent = 'في انتظار تسجيل رحلات لحساب الساعات.';
      hoursStatusEl.className =
        'text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300';
    }
  }

  // Peak & quality
  const peakTripsRatioEl = document.getElementById('peakTripsRatio');
  const peakTimeRatioEl = document.getElementById('peakTimeRatio');
  const peakStatusEl = document.getElementById('peakStatus');
  const acceptanceDisplay = document.getElementById('acceptanceDisplay');
  const cancelDisplay = document.getElementById('cancelDisplay');
  const qualityHint = document.getElementById('qualityHint');

  if (peakTripsRatioEl)
    peakTripsRatioEl.textContent =
      totalTrips > 0 ? peakTripsPercent.toFixed(1) + '%' : '0%';
  if (peakTimeRatioEl)
    peakTimeRatioEl.textContent =
      totalSeconds > 0 ? peakTimePercent.toFixed(1) + '%' : '0%';

  if (peakStatusEl) {
    if (totalTrips === 0) {
      peakStatusEl.textContent = 'في انتظار تسجيل رحلات لحساب الذروة.';
      peakStatusEl.className =
        'text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300';
    } else if (peakTripsPercent >= minPeakPercent) {
      peakStatusEl.textContent = '✅ نسبة رحلات الذروة تحقق شرط ثرايف (حسب عدد الرحلات).';
      peakStatusEl.className =
        'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300';
    } else {
      peakStatusEl.textContent =
        '⚠ نسبة رحلات الذروة أقل من المطلوب، حاول تركيز العمل في أوقات الذروة.';
      peakStatusEl.className =
        'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300';
    }
  }

  if (acceptanceDisplay) {
    acceptanceDisplay.textContent =
      acceptance != null ? acceptance.toFixed(2) + '%' : 'غير مدخل';
  }
  if (cancelDisplay) {
    cancelDisplay.textContent = cancel != null ? cancel.toFixed(2) + '%' : 'غير مدخل';
  }
  if (qualityHint) {
    const parts = [];
    if (acceptance != null) {
      if (acceptance >= 65) {
        parts.push('✅ نسبة القبول أعلى من 65% (شرط متحقق حسب الإدخال).');
      } else {
        parts.push('⚠ نسبة القبول أقل من 65% — حاول تقليل رفض الطلبات.');
      }
    } else {
      parts.push('أدخل نسبة القبول الرسمية من تطبيق أوبر/ثرایف.');
    }
    if (cancel != null) {
      if (cancel <= 10) {
        parts.push('✅ نسبة الإلغاء أقل من 10% (شرط متحقق حسب الإدخال).');
      } else {
        parts.push('⚠ نسبة الإلغاء أعلى من 10% — تجنب إلغاء الرحلات قدر الإمكان.');
      }
    } else {
      parts.push('أدخل نسبة الإلغاء الرسمية من تطبيق أوبر/ثرایف.');
    }
    qualityHint.textContent = parts.join(' ');
  }

  // Eligibility
  if (eligibilityBadge) {
    let okHours = totalHours >= minHours;
    let okTrips = totalTrips >= requiredTrips && totalTrips >= minTrips;
    let okPeak = peakTripsPercent >= minPeakPercent;
    let okAcc = acceptance != null ? acceptance >= 65 : false;
    let okCancel = cancel != null ? cancel <= 10 : false;

    if (totalTrips === 0) {
      eligibilityBadge.textContent = 'في انتظار بيانات رحلات هذا الأسبوع.';
      eligibilityBadge.className =
        'text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300';
    } else if (okHours && okTrips && okPeak && okAcc && okCancel) {
      eligibilityBadge.textContent = '🚀 مؤهل للحافز (حسب البيانات المدخلة تقريبًا).';
      eligibilityBadge.className =
        'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-dark';
    } else {
      eligibilityBadge.textContent =
        'بعض الشروط لم تتحقق بعد. راجع التفاصيل في الداشبورد والإعدادات.';
      eligibilityBadge.className =
        'text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-200';
    }
  }

  // Rides table
  renderRidesTable(rides);

  // If on report page, render report
  const reportRoot = document.getElementById('reportRoot');
  if (reportRoot) {
    renderReport(
      reportRoot,
      {
        totalTrips,
        totalHours,
        totalFare,
        totalCash,
        totalCard,
        minHours,
        minTrips,
        minPeakPercent,
        incentivePerTrip,
        totalIncentive,
        incomeBoostPercent,
        peakTripsPercent,
        peakTimePercent,
        acceptance,
        cancel,
        requiredTrips,
        peakTripsCount
      },
      rides
    );
  }
}

function renderRidesTable(rides) {
  const tbody = document.getElementById('ridesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  rides.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-900/60';
    const mins = (r.durationSec || 0) / 60;
    tr.innerHTML = `
      <td class="px-2 py-1 whitespace-nowrap">${idx + 1}</td>
      <td class="px-2 py-1 whitespace-nowrap">${formatDateTime(r.start)}</td>
      <td class="px-2 py-1 whitespace-nowrap">${formatDateTime(r.end)}</td>
      <td class="px-2 py-1">${mins.toFixed(1)}</td>
      <td class="px-2 py-1">${r.fare != null ? r.fare.toFixed(2) : '-'}</td>
      <td class="px-2 py-1">${
        r.cashPart != null
          ? r.cashPart.toFixed(2)
          : r.payment === 'cash'
          ? (r.fare || 0).toFixed(2)
          : '-'
      }</td>
      <td class="px-2 py-1">${
        r.cardPart != null
          ? r.cardPart.toFixed(2)
          : r.payment === 'card'
          ? (r.fare || 0).toFixed(2)
          : r.payment === 'cash'
          ? '0.00'
          : '-'
      }</td>
      <td class="px-2 py-1">${r.isPeak ? '✅' : '—'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ============ Report Rendering ============
function renderReport(root, summary, rides) {
  const {
    totalTrips,
    totalHours,
    totalFare,
    totalCash,
    totalCard,
    minHours,
    minTrips,
    minPeakPercent,
    incentivePerTrip,
    totalIncentive,
    incomeBoostPercent,
    peakTripsPercent,
    peakTimePercent,
    acceptance,
    cancel,
    requiredTrips,
    peakTripsCount
  } = summary;

  const okHours = totalHours >= minHours;
  const okTrips = totalTrips >= requiredTrips && totalTrips >= minTrips;
  const okPeak = peakTripsPercent >= minPeakPercent;
  const okAcc = acceptance != null && acceptance >= 65;
  const okCancel = cancel != null && cancel <= 10;
  const weekText = getWeekInfoText();

  const fmtBool = (ok) => (ok ? '✅ متحقق' : '❌ غير متحقق');
  const fmtPercent = (v) => (v != null ? v.toFixed(2) + '%' : '-');
  const fmtMoney = (v) => (v != null ? v.toFixed(2) + ' ر.س' : '-');
  const fmtNum = (v) => (v != null ? v.toString() : '-');

  const rowsHtml = rides
    .map((r, i) => {
      const mins = (r.durationSec || 0) / 60;
      const cash =
        r.cashPart != null ? r.cashPart : r.payment === 'cash' ? (r.fare || 0) : 0;
      const card =
        r.cardPart != null
          ? r.cardPart
          : r.payment === 'card'
          ? (r.fare || 0)
          : r.payment === 'cash'
          ? 0
          : null;
      return `
      <tr class="border-b border-slate-800">
        <td class="px-2 py-1">${i + 1}</td>
        <td class="px-2 py-1 whitespace-nowrap">${formatDateTime(r.start)}</td>
        <td class="px-2 py-1 whitespace-nowrap">${formatDateTime(r.end)}</td>
        <td class="px-2 py-1">${mins.toFixed(1)}</td>
        <td class="px-2 py-1">${r.fare != null ? r.fare.toFixed(2) : '-'}</td>
        <td class="px-2 py-1">${cash ? cash.toFixed(2) : '-'}</td>
        <td class="px-2 py-1">${
          card != null ? card.toFixed(2) : '-'
        }</td>
        <td class="px-2 py-1">${r.isPeak ? 'ذروة' : 'عادي'}</td>
      </tr>
    `;
    })
    .join('');

  root.innerHTML = `
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-semibold text-sm">تقرير أسبوع الحافز - ملخص الأداء</p>
          <p class="text-[11px] text-slate-400">يُبنى هذا التقرير من البيانات المسجلة في هذا الأسبوع على جهازك.</p>
          <p class="text-[11px] text-slate-400 mt-1">${weekText}</p>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div class="bg-soft rounded-2xl p-3 space-y-1">
          <p class="text-[11px] text-slate-400">إجمالي الرحلات</p>
          <p class="text-lg font-bold">${fmtNum(totalTrips)}</p>
        </div>
        <div class="bg-soft rounded-2xl p-3 space-y-1">
          <p class="text-[11px] text-slate-400">إجمالي ساعات العمل (من مدد الرحلات)</p>
          <p class="text-lg font-bold">${totalHours.toFixed(2)}</p>
        </div>
        <div class="bg-soft rounded-2xl p-3 space-y-1">
          <p class="text-[11px] text-slate-400">إجمالي الدخل الأساسي من الرحلات</p>
          <p class="text-lg font-bold">${fmtMoney(totalFare)}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div class="bg-soft rounded-2xl p-3 space-y-1">
          <p class="text-[11px] text-slate-400">إجمالي الحافز (إذا تحقق)</p>
          <p class="text-lg font-bold">${fmtMoney(totalIncentive)}</p>
        </div>
        <div class="bg-soft rounded-2xl p-3 space-y-1">
          <p class="text-[11px] text-slate-400">نسبة الزيادة الفعلية على الدخل</p>
          <p class="text-lg font-bold">${
            incomeBoostPercent != null ? incomeBoostPercent.toFixed(1) + '%' : '-'
          }</p>
        </div>
        <div class="bg-soft rounded-2xl p-3 space-y-1">
          <p class="text-[11px] text-slate-400">عدد رحلات الذروة</p>
          <p class="text-lg font-bold">${fmtNum(peakTripsCount)} (${peakTripsPercent.toFixed(
    1
  )}%)</p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div class="bg-soft rounded-2xl p-3 space-y-1">
          <p class="font-semibold text-[12px] text-slate-100 mb-1">الشروط الرسمية للحافز (حسب إدخالك)</p>
          <ul class="space-y-1 list-disc list-inside">
            <li>الحد الأدنى للساعات: ${minHours} ساعة → ${fmtBool(okHours)}</li>
            <li>الحد الأدنى للرحلات + الشرط التصاعدي: مطلوب ${requiredTrips} رحلة (على الأقل ${minTrips}) → ${fmtBool(
    okTrips
  )}</li>
            <li>الحد الأدنى لنسبة رحلات الذروة: ${minPeakPercent}% → ${fmtBool(
    okPeak
  )} (حاليًا ${peakTripsPercent.toFixed(1)}%)</li>
            <li>نسبة القبول الرسمية ≥ 65% → ${fmtBool(okAcc)} (حاليًا ${
    acceptance != null ? acceptance.toFixed(2) + '%' : 'غير مدخلة'
  })</li>
            <li>نسبة الإلغاء الرسمية ≤ 10% → ${fmtBool(okCancel)} (حاليًا ${
    cancel != null ? cancel.toFixed(2) + '%' : 'غير مدخلة'
  })</li>
          </ul>
        </div>
        <div class="bg-soft rounded-2xl p-3 space-y-1">
          <p class="font-semibold text-[12px] text-slate-100 mb-1">قرار الحافز (تقديري حسب البيانات)</p>
          <p class="text-[12px]">
            ${
              okHours && okTrips && okPeak && okAcc && okCancel
                ? '✅ جميع الشروط المدخلة متحققة تقريبًا، يفترض (منطقيًا) استحقاق الحافز لهذا الأسبوع.'
                : '❌ لم تتحقق جميع الشروط بعد وفقًا للبيانات المدخلة. استخدم هذا التقرير كمرجع عند مراجعة الشركة.'
            }
          </p>
          <p class="text-[11px] text-slate-400 mt-2">
            ملاحظة: هذا التقرير يعتمد بالكامل على البيانات التي أدخلتها أنت في المتتبع، ولا يرتبط مباشرة بأنظمة أوبر أو ثرايف.
          </p>
        </div>
      </div>

      <div class="bg-soft rounded-2xl p-3 space-y-2 text-xs mt-3">
        <p class="font-semibold text-[12px] text-slate-100 mb-1">تفاصيل الرحلات</p>
        <div class="overflow-x-auto border border-slate-800 rounded-2xl">
          <table class="min-w-full text-[11px]">
            <thead class="bg-slate-900 text-slate-300">
              <tr>
                <th class="px-2 py-2 text-right">#</th>
                <th class="px-2 py-2 text-right">بداية</th>
                <th class="px-2 py-2 text-right">نهاية</th>
                <th class="px-2 py-2 text-right">مدة (دقائق)</th>
                <th class="px-2 py-2 text-right">قيمة الرحلة</th>
                <th class="px-2 py-2 text-right">كاش</th>
                <th class="px-2 py-2 text-right">بطاقة</th>
                <th class="px-2 py-2 text-right">نوع الفترة</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800 bg-slate-950/40">
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ============ Views (Dashboard / Rides / Settings / Report) ============
let currentView = 'dashboard';

function setView(view) {
  currentView = view;
  document.querySelectorAll('[data-view]').forEach((el) => {
    if (el.dataset.view === view) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const v = btn.dataset.navView;
    if (v === view) {
      btn.classList.add('bg-soft', 'text-slate-100');
      btn.classList.remove('bg-transparent');
    } else {
      btn.classList.remove('bg-soft', 'text-slate-100');
      btn.classList.add('bg-transparent');
    }
  });

  if (view === 'report') {
    window.open('report.html', '_blank');
    // بعد فتح التقرير، نرجع للداشبورد
    currentView = 'dashboard';
    document.querySelectorAll('[data-view]').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.view !== 'dashboard');
    });
  }
}

// ============ UI Binding ============
let currentRide = null;
let deferredPrompt = null;

function bindUI() {
  const minHoursInput = document.getElementById('minHoursInput');
  const minTripsInput = document.getElementById('minTripsInput');
  const minPeakRatioInput = document.getElementById('minPeakRatioInput');
  const incentivePerTripInput = document.getElementById('incentivePerTripInput');
  const acceptanceInput = document.getElementById('acceptanceInput');
  const cancelInput = document.getElementById('cancelInput');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const newWeekBtn = document.getElementById('newWeekBtn');

  const startRideBtn = document.getElementById('startRideBtn');
  const endRideBtn = document.getElementById('endRideBtn');
  const currentRideHint = document.getElementById('currentRideHint');
  const exportBtn = document.getElementById('exportBtn');
  const openReportBtn = document.getElementById('openReportBtn');

  const endRideModal = document.getElementById('endRideModal');
  const fareInput = document.getElementById('fareInput');
  const cashPartInput = document.getElementById('cashPartInput');
  const mixedCashContainer = document.getElementById('mixedCashContainer');
  const payButtons = document.querySelectorAll('.payBtn');
  const cancelEndRideBtn = document.getElementById('cancelEndRideBtn');
  const confirmEndRideBtn = document.getElementById('confirmEndRideBtn');

  const menuToggleBtn = document.getElementById('menuToggleBtn');
  const closeMenuBtn = document.getElementById('closeMenuBtn');
  const sideMenu = document.getElementById('sideMenu');
  const navButtons = document.querySelectorAll('.nav-btn');

  // Fill settings
  if (minHoursInput) minHoursInput.value = state.rules.minHours;
  if (minTripsInput) minTripsInput.value = state.rules.minTrips;
  if (minPeakRatioInput) minPeakRatioInput.value = state.rules.minPeakTripsPercent;
  if (incentivePerTripInput) incentivePerTripInput.value = state.rules.incentivePerTrip;
  if (acceptanceInput && state.stats.acceptance != null)
    acceptanceInput.value = state.stats.acceptance;
  if (cancelInput && state.stats.cancel != null) cancelInput.value = state.stats.cancel;

  // Save settings
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
      state.rules.minHours = minHoursInput.value ? Number(minHoursInput.value) : 0;
      state.rules.minTrips = minTripsInput.value ? Number(minTripsInput.value) : 0;
      state.rules.minPeakTripsPercent = minPeakRatioInput.value
        ? Number(minPeakRatioInput.value)
        : 0;
      state.rules.incentivePerTrip = incentivePerTripInput.value
        ? Number(incentivePerTripInput.value)
        : 0;
      state.stats.acceptance = acceptanceInput.value ? Number(acceptanceInput.value) : null;
      state.stats.cancel = cancelInput.value ? Number(cancelInput.value) : null;
      saveState();
      recalcDashboard();
    });
  }

  // New week: clear all
  if (newWeekBtn) {
    newWeekBtn.addEventListener('click', () => {
      if (
        !confirm(
          'سيتم مسح جميع الرحلات المسجلة لهذا الأسبوع من هذا الجهاز فقط. هل أنت متأكد؟'
        )
      )
        return;
      state.rides = [];
      currentRide = null;
      saveState();
      recalcDashboard();
      if (currentRideHint) currentRideHint.textContent = 'لا توجد رحلة مفتوحة حاليًا.';
    });
  }

  // التحكم في القائمة المنزلقة
  if (menuToggleBtn && sideMenu) {
    menuToggleBtn.addEventListener('click', () => {
      sideMenu.classList.remove('translate-x-full');
    });
  }
  if (closeMenuBtn && sideMenu) {
    closeMenuBtn.addEventListener('click', () => {
      sideMenu.classList.add('translate-x-full');
    });
  }

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.navView;
      if (!targetView) return;
      setView(targetView);
      if (sideMenu) sideMenu.classList.add('translate-x-full');
    });
  });

  // Current ride UI
  function refreshCurrentRideUI() {
    if (!startRideBtn || !endRideBtn || !currentRideHint) return;
    if (currentRide) {
      startRideBtn.disabled = true;
      endRideBtn.disabled = false;
      currentRideHint.textContent = 'رحلة مفتوحة منذ: ' + formatDateTime(currentRide.start);
    } else {
      startRideBtn.disabled = false;
      endRideBtn.disabled = true;
      currentRideHint.textContent = 'لا توجد رحلة مفتوحة حاليًا.';
    }
  }

  // Start ride
  if (startRideBtn) {
    startRideBtn.addEventListener('click', () => {
      if (currentRide) return;
      const now = new Date().toISOString();
      currentRide = { start: now };
      refreshCurrentRideUI();
    });
  }

  // End ride -> open modal
  if (endRideBtn) {
    endRideBtn.addEventListener('click', () => {
      if (!currentRide) return;
      if (!endRideModal) return;
      endRideModal.classList.remove('pointer-events-none');
      endRideModal.classList.remove('opacity-0');
      endRideModal.dataset.selectedPay = '';
      if (fareInput) fareInput.value = '';
      if (cashPartInput) cashPartInput.value = '';
      if (mixedCashContainer) mixedCashContainer.classList.add('hidden');
      payButtons.forEach((btn) => {
        btn.classList.remove('bg-emerald-500', 'text-dark');
        btn.classList.add('bg-soft');
      });
    });
  }

  // Payment buttons
  payButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      payButtons.forEach((b) => {
        b.classList.remove('bg-emerald-500', 'text-dark');
        b.classList.add('bg-soft');
      });
      btn.classList.add('bg-emerald-500', 'text-dark');
      btn.classList.remove('bg-soft');
      if (endRideModal) endRideModal.dataset.selectedPay = btn.dataset.pay;
      if (mixedCashContainer) {
        if (btn.dataset.pay === 'mixed') mixedCashContainer.classList.remove('hidden');
        else mixedCashContainer.classList.add('hidden');
      }
    });
  });

  // Cancel end ride
  if (cancelEndRideBtn) {
    cancelEndRideBtn.addEventListener('click', () => {
      if (!endRideModal) return;
      endRideModal.classList.add('opacity-0');
      endRideModal.classList.add('pointer-events-none');
    });
  }

  // Confirm end ride (منطق الدفع المختلط مع التركيز على الكاش)
  if (confirmEndRideBtn) {
    confirmEndRideBtn.addEventListener('click', () => {
      if (!currentRide) return;
      const endTime = new Date().toISOString();
      const startTime = currentRide.start;
      const durationSec = Math.max(
        0,
        Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000)
      );

      const rawFareVal = fareInput && fareInput.value ? Number(fareInput.value) : null;
      const payMethod = endRideModal ? endRideModal.dataset.selectedPay || null : null;
      let fareVal = rawFareVal;
      let cashPart = null;
      let cardPart = null;

      if (!payMethod) {
        alert('الرجاء اختيار طريقة الدفع.');
        return;
      }

      if (payMethod === 'cash' || payMethod === 'card') {
        if (!fareVal || fareVal <= 0) {
          alert('الرجاء إدخال قيمة الرحلة لهذه الطريقة (كاش أو بطاقة).');
          return;
        }
        if (payMethod === 'cash') {
          cashPart = fareVal;
          cardPart = 0;
        } else {
          cashPart = 0;
          cardPart = fareVal;
        }
      } else if (payMethod === 'mixed') {
        const cashVal =
          cashPartInput && cashPartInput.value ? Number(cashPartInput.value) : 0;
        if (!cashVal || cashVal <= 0) {
          alert('في حالة الدفع المختلط، الرجاء إدخال المبلغ الكاش المستلم من العميل.');
          return;
        }
        cashPart = cashVal;

        // قيمة الرحلة الكاملة اختيارية:
        // إذا لم تُدخل، يعتبر الدخل الأساسي لهذه الرحلة = الكاش فقط.
        if (!fareVal || fareVal <= 0) {
          fareVal = cashVal;
          cardPart = 0;
        } else {
          if (cashVal > fareVal) {
            alert('المبلغ الكاش لا يمكن أن يكون أكبر من قيمة الرحلة الكاملة.');
            return;
          }
          cardPart = fareVal - cashVal;
        }
      }

      const ride = {
        start: startTime,
        end: endTime,
        durationSec,
        fare: fareVal,
        payment: payMethod,
        cashPart,
        cardPart,
        isPeak: isPeak(startTime)
      };

      state.rides.push(ride);
      currentRide = null;
      saveState();
      if (endRideModal) {
        endRideModal.classList.add('opacity-0');
        endRideModal.classList.add('pointer-events-none');
      }
      refreshCurrentRideUI();
      recalcDashboard();
    });
  }

  // Export
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const dataStr =
        'data:text/json;charset=utf-8,' +
        encodeURIComponent(JSON.stringify(state, null, 2));
      const a = document.createElement('a');
      a.href = dataStr;
      a.download = 'thrivve-tracker-week.json';
      a.click();
    });
  }

  // Open report
  if (openReportBtn) {
    openReportBtn.addEventListener('click', () => {
      window.open('report.html', '_blank');
    });
  }

  refreshCurrentRideUI();
  setView('dashboard');
}

// ============ PWA Install ============
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('installBtn');
  if (installBtn) installBtn.classList.remove('hidden');
});

function setupInstallButton() {
  const installBtn = document.getElementById('installBtn');
  if (!installBtn) return;
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add('hidden');
  });
}

// ============ Bootstrap ============
window.addEventListener('load', () => {
  loadState();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }
  bindUI();
  setupInstallButton();
  recalcDashboard();
});
