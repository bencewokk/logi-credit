const fakeTransactions = [
  { id: 'LC-2401', customer: 'Kovács Anna', date: '2025-09-30', amount: 1200000, status: 'approved' },
  { id: 'LC-2402', customer: 'Szabó Péter', date: '2025-09-30', amount: 480000, status: 'approved' },
  { id: 'LC-2403', customer: 'Nagy Éva', date: '2025-10-01', amount: 950000, status: 'pending' },
  { id: 'LC-2404', customer: 'Tóth Gábor', date: '2025-10-02', amount: 1750000, status: 'approved' },
  { id: 'LC-2405', customer: 'Kiss Dóra', date: '2025-10-02', amount: 380000, status: 'rejected' },
  { id: 'LC-2406', customer: 'Farkas Bence', date: '2025-10-03', amount: 1420000, status: 'approved' },
  { id: 'LC-2407', customer: 'Horváth Lilla', date: '2025-10-03', amount: 610000, status: 'approved' },
  { id: 'LC-2408', customer: 'Varga Levente', date: '2025-10-04', amount: 820000, status: 'pending' }
];

const formatCurrency = new Intl.NumberFormat('hu-HU', {
  style: 'currency',
  currency: 'HUF',
  maximumFractionDigits: 0
});

const formatDate = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function renderTransactions(transactions) {
  const tbody = document.getElementById('transaction-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  transactions.forEach(tx => {
    const row = document.createElement('tr');

    row.innerHTML = `
      <td>${tx.id}</td>
      <td>${tx.customer}</td>
      <td>${formatDate.format(new Date(tx.date))}</td>
      <td>${formatCurrency.format(tx.amount)}</td>
      <td>${renderStatusPill(tx.status)}</td>
    `;

    tbody.appendChild(row);
  });
}

function renderStatusPill(status) {
  const className = {
    approved: 'status-approved',
    pending: 'status-pending',
    rejected: 'status-rejected'
  }[status] || 'status-pending';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="status-pill ${className}">${label}</span>`;
}

function calculateSummaries(transactions) {
  const totalVolume = transactions
    .filter(tx => tx.status !== 'rejected')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const approvedTransactions = transactions.filter(tx => tx.status === 'approved');
  const averageTicket = approvedTransactions.length
    ? approvedTransactions.reduce((sum, tx) => sum + tx.amount, 0) / approvedTransactions.length
    : 0;

  const approvalRate = transactions.length
    ? Math.round((approvedTransactions.length / transactions.length) * 100)
    : 0;

  const summaryElements = {
    total: document.getElementById('summary-total-volume'),
    average: document.getElementById('summary-average-ticket'),
    approval: document.getElementById('summary-approval-rate')
  };

  if (summaryElements.total) {
    summaryElements.total.textContent = formatCurrency.format(totalVolume);
  }
  if (summaryElements.average) {
    summaryElements.average.textContent = formatCurrency.format(Math.round(averageTicket));
  }
  if (summaryElements.approval) {
    summaryElements.approval.textContent = `${approvalRate}%`;
  }
}

function buildChartData(transactions) {
  const dailyTotals = new Map();
  transactions.forEach(tx => {
    const key = tx.date;
    const currentSum = dailyTotals.get(key) || 0;
    const amount = tx.status === 'rejected' ? 0 : tx.amount;
    dailyTotals.set(key, currentSum + amount);
  });

  const sortedEntries = Array.from(dailyTotals.entries()).sort(
    (a, b) => new Date(a[0]) - new Date(b[0])
  );

  return {
    labels: sortedEntries.map(([date]) => {
      return new Intl.DateTimeFormat('hu-HU', { month: '2-digit', day: '2-digit' }).format(new Date(date));
    }),
    data: sortedEntries.map(([, amount]) => Math.round((amount / 1000) * 10) / 10) // amounts in thousands HUF
  };
}

function renderChart(transactions) {
  const canvas = document.getElementById('volumeChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const { labels, data } = buildChartData(transactions);

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Disbursed amount (HUF x1000)',
          data,
          fill: true,
          tension: 0.35,
          backgroundColor: 'rgba(37, 99, 235, 0.15)',
          borderColor: 'rgba(37, 99, 235, 0.9)',
          pointBackgroundColor: 'rgba(37, 99, 235, 1)',
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => `${value.toLocaleString('hu-HU')}k`
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: context => formatCurrency.format(context.parsed.y * 1000)
          }
        }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderTransactions(fakeTransactions);
  calculateSummaries(fakeTransactions);
  renderChart(fakeTransactions);
});
