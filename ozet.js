(function() {
    window.ScheduleApp.modules.summary = {
        init: function() {
            const container = document.getElementById('summary-module-container');
            if (!container) return;

            // Özet modülünün HTML yapısını enjekte et
            container.innerHTML = `
                 <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 border-b pb-4">
                    <div class="flex items-center gap-4">
                        <h3 class="text-xl font-semibold">Özet Rapor</h3>
                    </div>
                    <div class="flex flex-wrap items-center justify-center gap-3">
                        <div class="flex items-center gap-2">
                            <label for="start-month-select" class="text-sm font-medium">Başlangıç:</label>
                            <select id="start-month-select"></select>
                            <select id="start-year-select"></select>
                        </div>
                        <div class="flex items-center gap-2">
                            <label for="end-month-select" class="text-sm font-medium">Bitiş:</label>
                            <select id="end-month-select"></select>
                            <select id="end-year-select"></select>
                        </div>
                    </div>
                </div>
                
                <div id="report-sub-nav" class="border-b border-gray-200 flex items-center gap-2">
                    <button data-tab="schedule" class="report-tab-btn nav-btn active py-2 px-3 text-sm font-semibold rounded-t-lg">Çizelge</button>
                    <button data-tab="visit" class="report-tab-btn nav-btn py-2 px-3 text-sm font-semibold rounded-t-lg">Şube Ziyaret</button>
                    <button data-tab="deploy" class="report-tab-btn nav-btn py-2 px-3 text-sm font-semibold rounded-t-lg">Deploy</button>
                </div>

                <div id="report-results-container" class="mt-4">
                     <div id="report-schedule-view" class="table-container"></div>
                     <div id="report-visit-view" class="table-container hidden"></div>
                     <div id="report-deploy-view" class="table-container hidden"></div>
                </div>
            `;

            // DOM Elementlerini Önbelleğe Al
            this.startMonthSelect = container.querySelector('#start-month-select');
            this.startYearSelect = container.querySelector('#start-year-select');
            this.endMonthSelect = container.querySelector('#end-month-select');
            this.endYearSelect = container.querySelector('#end-year-select');
            this.reportSubNav = container.querySelector('#report-sub-nav');
            
            this.scheduleView = container.querySelector('#report-schedule-view');
            this.visitView = container.querySelector('#report-visit-view');
            this.deployView = container.querySelector('#report-deploy-view');

            // Filtreleri doldur
            this.populateReportDateFilters();

            // Event Listener'ları Ekle
            [this.startMonthSelect, this.startYearSelect, this.endMonthSelect, this.endYearSelect].forEach(el => {
                el.addEventListener('change', () => this.generateAndRenderReport());
            });

            this.reportSubNav.addEventListener('click', e => {
                if (e.target.matches('.report-tab-btn')) {
                    window.ScheduleApp.state.selectedReportTab = e.target.dataset.tab;
                    this.generateAndRenderReport();
                }
            });

            this.missing = false; // Modülün yüklendiğini belirtir
        },

        populateReportDateFilters: function() {
            const { MONTH_NAMES, state } = window.ScheduleApp;
            const years = Array.from({length: 6}, (_, i) => 2025 + i);
            
            const yearOptions = years.map(y => `<option value="${y}">${y}</option>`).join('');
            const monthOptions = MONTH_NAMES.map((m, i) => `<option value="${i}">${m}</option>`).join('');

            this.startYearSelect.innerHTML = yearOptions;
            this.endYearSelect.innerHTML = yearOptions;
            this.startMonthSelect.innerHTML = monthOptions;
            this.endMonthSelect.innerHTML = monthOptions;

            const defaultYear = new Date().getFullYear();
            this.startYearSelect.value = years.includes(defaultYear) ? defaultYear : 2025;
            this.endYearSelect.value = years.includes(defaultYear) ? defaultYear : 2025;
            this.startMonthSelect.value = 0; // Yılın başı varsayılan
            this.endMonthSelect.value = state.currentMonth;
        },

        render: function() {
            // Özet sekmesi her açıldığında veya veriler değiştiğinde tabloyu yenile
            this.generateAndRenderReport();
        },

        generateAndRenderReport: function() {
            const { state } = window.ScheduleApp;
            
            // Sekme düğmelerinin aktifliğini ayarla
            document.querySelectorAll('.report-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === state.selectedReportTab);
            });
            
            // Bütün görünümleri gizle
            [this.scheduleView, this.visitView, this.deployView].forEach(view => view.classList.add('hidden'));

            const startMonth = parseInt(this.startMonthSelect.value);
            const startYear = parseInt(this.startYearSelect.value);
            const endMonth = parseInt(this.endMonthSelect.value);
            const endYear = parseInt(this.endYearSelect.value);
            
            const startDate = new Date(startYear, startMonth, 1);
            const endDate = new Date(endYear, endMonth, 1);
            
            if (startDate > endDate) {
                this.scheduleView.innerHTML = '<p class="text-center text-red-500 font-semibold">Başlangıç tarihi, bitiş tarihinden sonra olamaz.</p>';
                this.scheduleView.classList.remove('hidden');
                return;
            }

            // Seçili sekmeye göre ilgili fonksiyonu tetikle
            if (state.selectedReportTab === 'schedule') {
                this.scheduleView.classList.remove('hidden');
                this.renderReportScheduleTable(startDate, endDate);
            } else if (state.selectedReportTab === 'visit') {
                this.visitView.classList.remove('hidden');
                this.renderReportVisitTable(startDate, endDate);
            } else if (state.selectedReportTab === 'deploy') {
                this.deployView.classList.remove('hidden');
                this.renderReportDeployTable(startDate, endDate);
            }
        },

        renderReportScheduleTable: function(startDate, endDate) {
            const { state, utils, OFFICE_LIKE_STATUSES, HOME_LIKE_STATUSES, LEAVE_STATUSES } = window.ScheduleApp;
            const people = utils.getPeople();
            const reportStats = {};
            
            people.forEach(p => {
                reportStats[p.id] = { name: p.name, order: p.order, office: 0, home: 0, leave: 0, workDays: 0, oncall: 0, deploy: 0 };
            });

            for (let y = startDate.getFullYear(); y <= endDate.getFullYear(); y++) {
                const mStart = (y === startDate.getFullYear()) ? startDate.getMonth() : 0;
                const mEnd = (y === endDate.getFullYear()) ? endDate.getMonth() : 11;
                
                for (let m = mStart; m <= mEnd; m++) {
                    const monthData = state.data.draftSchedules?.[y]?.[m] || state.data.publishedSchedules?.[y]?.[m] || {};
                    const daysInMonth = new Date(y, m + 1, 0).getDate();

                    for (let d = 1; d <= daysInMonth; d++) {
                        if (new Date(y, m, d).getDay() % 6 === 0) continue; // Hafta sonunu atla
                        const dayData = monthData[d] || {};
                        
                        people.forEach(person => {
                             if (!utils.getActivePeopleForDate(y, m, d).some(p => p.id === person.id)) return;
                             const personStatus = dayData[person.id]?.status;
                             
                             if(OFFICE_LIKE_STATUSES.includes(personStatus)) { reportStats[person.id].office++; reportStats[person.id].workDays++; }
                             else if(HOME_LIKE_STATUSES.includes(personStatus)) { reportStats[person.id].home++; reportStats[person.id].workDays++; }
                             else if(LEAVE_STATUSES.includes(personStatus)) { reportStats[person.id].leave++; }
                             
                             if (dayData.oncall?.personId === person.id) reportStats[person.id].oncall++;
                             if (dayData.deploy?.personId === person.id) reportStats[person.id].deploy++;
                        });
                    }
                }
            }
            
            let html = `<table class="w-full text-sm report-table">
                            <thead><tr><th>Kişi</th><th>Ofis</th><th>Ev</th><th>Ofis %</th><th>İzin</th><th>Nöbet</th><th>Deploy</th></tr></thead>
                            <tbody>`;
            Object.values(reportStats).sort((a,b) => a.order - b.order).forEach(stats => {
                const officeRatio = stats.workDays > 0 ? Math.round((stats.office / stats.workDays) * 100) : 0;
                html += `<tr>
                            <td class="p-2 border text-left font-semibold">${stats.name}</td>
                            <td class="p-2 border">${stats.office}</td>
                            <td class="p-2 border">${stats.home}</td>
                            <td class="p-2 border font-bold">${officeRatio}%</td>
                            <td class="p-2 border">${stats.leave}</td>
                            <td class="p-2 border">${stats.oncall}</td>
                            <td class="p-2 border">${stats.deploy}</td>
                         </tr>`;
            });
            html += `</tbody></table>`;
            this.scheduleView.innerHTML = html;
        },

        renderReportVisitTable: function(startDate, endDate) {
            const { state, utils } = window.ScheduleApp;
             const allVisits = state.data.branchVisits || [];
             const people = utils.getPeople();
             const endOfMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);

             const reportVisits = allVisits.filter(v => {
                if (!v.date) return false;
                const d = new Date(v.date);
                return d >= startDate && d <= endOfMonth;
             }).sort((a,b) => new Date(a.date) - new Date(b.date));
            
             let html = '';
             if(reportVisits.length > 0) {
                 html += `<table class="w-full text-sm report-table">
                                <thead><tr><th>Tarih</th><th>Kişi</th><th>Tip</th><th>Şube Adı</th></tr></thead>
                                <tbody>` + 
                 reportVisits.map(visit => {
                    const person = people.find(p => p.id === visit.personId);
                    return `<tr>
                                <td class="p-2 border">${new Date(visit.date).toLocaleDateString('tr-TR')}</td>
                                <td class="p-2 border">${person?.name || ''}</td>
                                <td class="p-2 border">${visit.type || ''}</td>
                                <td class="p-2 border text-left">${visit.name || ''}</td>
                            </tr>`;
                 }).join('') + `</tbody></table>`;
             } else {
                 html += '<p class="text-center p-4 text-gray-500">Seçilen aralıkta şube ziyareti bulunamadı.</p>';
             }
             this.visitView.innerHTML = html;
        },

        renderReportDeployTable: function(startDate, endDate) {
            const { state, utils } = window.ScheduleApp;
            const people = utils.getPeople(false);
            const deployData = state.data.deployData || [];
            const endOfMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
            let allDeployEvents = [];

            for (let y = startDate.getFullYear(); y <= endDate.getFullYear(); y++) {
                const mStart = (y === startDate.getFullYear()) ? startDate.getMonth() : 0;
                const mEnd = (y === endDate.getFullYear()) ? endDate.getMonth() : 11;
                for (let m = mStart; m <= mEnd; m++) {
                    const monthData = state.data.draftSchedules?.[y]?.[m] || state.data.publishedSchedules?.[y]?.[m] || {};
                    const daysInMonth = new Date(y, m + 1, 0).getDate();

                    for (let d = 1; d <= daysInMonth; d++) {
                        const eventDate = new Date(y, m, d);
                        if (eventDate < startDate || eventDate > endOfMonth) continue;
                        const person = people.find(p => p.id === monthData[d]?.deploy?.personId);
                        if(person) {
                            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            allDeployEvents.push({ 
                                date: eventDate, 
                                person: person.name, 
                                name: (deployData.find(d => d.date === dateStr) || { name: '(Belirtilmemiş)' }).name 
                            });
                        }
                    }
                }
            }

            allDeployEvents.sort((a,b) => a.date - b.date);
            
            let html = '';
            if (allDeployEvents.length > 0) {
                html = `<table class="w-full text-sm report-table">
                            <thead><tr><th>Tarih</th><th>Kişi</th><th>Açıklama</th></tr></thead>
                            <tbody>` +
                allDeployEvents.map(event => `
                     <tr>
                        <td class="p-2 border">${event.date.toLocaleDateString('tr-TR')}</td>
                        <td class="p-2 border">${event.person}</td>
                        <td class="p-2 border text-left">${event.name}</td>
                    </tr>
                `).join('') + '</tbody></table>';
            } else {
                html = '<p class="text-center p-4 text-gray-500">Seçilen aralıkta deploy kaydı bulunamadı.</p>';
            }
            this.deployView.innerHTML = html;
        }
    };
})();