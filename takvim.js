(function() {
    window.ScheduleApp.modules.calendar = {
        init: function() {
            const container = document.getElementById('calendar-module-container');
            if (!container) return;

            // Takvim modülüne özel CSS'i dinamik olarak sayfaya ekleyerek, 
            // index.html'deki CSS değişikliklerinden (excel görünümü vs.) etkilenmesini önlüyoruz.
            if (!document.getElementById('calendar-module-styles')) {
                const style = document.createElement('style');
                style.id = 'calendar-module-styles';
                style.textContent = `
                    .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
                    .calendar-header { text-align: center; font-weight: 600; padding-bottom: 4px; color: #4b5563; }
                    .calendar-day { min-height: 120px; border-radius: 8px; position: relative; overflow-y: hidden; background-color: #f9fafb; color: #9ca3af; display: flex; flex-direction: column; justify-content: space-between; padding: 6px; cursor: pointer; border: 1px solid #e5e7eb; transition: all 0.2s; }
                    .calendar-day:hover { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); z-index: 10; border-color: #93c5fd; transform: translateY(-2px); }
                    .calendar-day.current-month { color: #111827; }
                    .calendar-day.weekend-day { background-color: #f3f4f6 !important; cursor: default; opacity: 0.8; }
                    .day-number { font-weight: 600; text-align: left; position: relative; z-index: 2; align-self: flex-start; padding: 2px; }
                    .day-number.today { color: #ffffff; background-color: #3b82f6; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; padding: 0; }
                    .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 2.5rem; font-weight: 800; color: rgba(0, 0, 0, 0.06); white-space: nowrap; pointer-events: none; z-index: 1; text-align: center; }
                    .event-list { position: relative; z-index: 2; text-align: left; font-size: 11px; font-weight: 600; line-height: 1.4; display: flex; flex-direction: column; gap: 4px; margin-top: auto; }
                    .event-item { background-color: rgba(255, 255, 255, 0.9); padding: 3px 6px; border-radius: 4px; color: #374151; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
                    .event-note { border-left: 3px solid #f59e0b; }
                    .event-lock { border-left: 3px solid #ef4444; color: #b91c1c; }
                    .event-visit { border-left: 3px solid #0ea5e9; color: #0369a1; }
                    .event-deploy { border-left: 3px solid #8b5cf6; color: #581c87; }
                `;
                document.head.appendChild(style);
            }

            // HTML iskeletini oluştur
            container.innerHTML = `
                <div class="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                    <div class="flex items-center gap-4">
                        <h3 id="calendar-title" class="text-lg font-semibold text-gray-800">Kişisel Takvim</h3>
                        <div id="calendar-publish-status" class="hidden font-semibold text-sm py-1 px-3 rounded-lg shadow-sm"></div>
                    </div>
                    <div class="flex items-center gap-4">
                        <div id="person-selector-container">
                            <select id="person-selector" class="border border-gray-300 rounded-lg px-4 py-2 text-base font-medium w-full sm:w-auto"></select>
                        </div>
                        <button id="calendar-save-btn" class="hidden font-semibold text-sm py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-sm">Değişiklikleri Kaydet</button>
                    </div>
                </div>
                <div id="calendar-container"></div>
                <div id="calendar-summaries" class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm"></div>
            `;

            // Elementlerin Önbelleğe Alınması
            this.personSelector = document.getElementById('person-selector');
            this.calendarContainer = document.getElementById('calendar-container');
            this.calendarSaveBtn = document.getElementById('calendar-save-btn');
            this.personSelectorContainer = document.getElementById('person-selector-container');
            this.calendarTitle = document.getElementById('calendar-title');
            this.calendarPublishStatus = document.getElementById('calendar-publish-status');
            this.calendarSummaries = document.getElementById('calendar-summaries');

            // Event Listeners
            this.personSelector.addEventListener('change', () => this.render());
            this.calendarContainer.addEventListener('click', (e) => this.handleCalendarClick(e));
            this.calendarSaveBtn.addEventListener('click', () => this.handleCalendarSave());

            this.missing = false;
        },

        updateForAuth: function(isAdmin) {
            if (this.personSelectorContainer) {
                this.personSelectorContainer.classList.toggle('hidden', !isAdmin);
            }
            this.populatePersonSelector();
        },

        populatePersonSelector: function() {
            const { utils, state } = window.ScheduleApp;
            if (!this.personSelector) return;
            
            const people = utils.getPeople();
            this.personSelector.innerHTML = '<option value="" selected disabled>-- Kişi Seçin --</option>' +
                people.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                
            if (state.currentUser?.role === 'user') {
                this.personSelector.value = state.currentUser.id;
            }
        },

        handleCalendarClick: function(event) {
            const { state, utils, REQUEST_STATUSES, WORK_LIKE_STATUSES } = window.ScheduleApp;
            const cell = event.target.closest('.calendar-day.current-month:not(.weekend-day)');
            if (!cell || !state.currentUser || state.currentUser.role === 'admin') return; 
            
            const day = parseInt(cell.dataset.day);
            const personId = state.currentUser.id;
            const isPublished = state.tempScheduleData.isPublished || false;
            const cellDate = new Date(state.currentYear, state.currentMonth, day);
            const dayData = state.tempScheduleData[day]?.[personId] || {};
            const isLocked = dayData.manual || (state.calendarChanges[day]?.locked === true);
            const today = new Date();
            today.setHours(0,0,0,0);

            let items = [];
            
            // Not Ekleme / Düzenleme
            items.push({ label: 'Not Ekle', action: () => {
                const currentNote = state.data.notes?.[state.currentYear]?.[state.currentMonth]?.[day]?.[personId] || '';
                utils.showNoteModal(currentNote, (newNote) => {
                    if (!state.calendarChanges[day]) state.calendarChanges[day] = {};
                    state.calendarChanges[day].note = newNote;
                    this.calendarSaveBtn.classList.remove('hidden');
                    this.render();
                });
            }});

            if (isPublished) {
                const isAutoAssignedWorkDay = (WORK_LIKE_STATUSES.includes(dayData.status)) && !dayData.manual;
                if (isLocked) {
                    items.push({ label: 'Sabitlemeyi Kaldır', action: () => {
                        if (!state.calendarChanges[day]) state.calendarChanges[day] = {};
                        state.calendarChanges[day].locked = false;
                        this.calendarSaveBtn.classList.remove('hidden');
                        this.render();
                    }});
                } else if (isAutoAssignedWorkDay) {
                    items.push({ label: 'Sabitle', action: () => {
                        if (!state.calendarChanges[day]) state.calendarChanges[day] = {};
                        state.calendarChanges[day].locked = true;
                        this.calendarSaveBtn.classList.remove('hidden');
                        this.render();
                    }});
                }
            }
            
            if (!isPublished && cellDate >= today) {
                if (REQUEST_STATUSES.includes(dayData.status)) {
                    items.push({ label: 'Talebini İptal Et', action: () => {
                        if (!state.calendarChanges[day]) state.calendarChanges[day] = {};
                        state.calendarChanges[day].status = null;
                        this.calendarSaveBtn.classList.remove('hidden');
                        this.render();
                    }});
                } else {
                    items.push({ label: 'İzin Talebi', action: () => {
                        if (!state.calendarChanges[day]) state.calendarChanges[day] = {};
                        state.calendarChanges[day].status = 'izt';
                        this.calendarSaveBtn.classList.remove('hidden');
                        this.render();
                    }});
                    items.push({ label: 'Serbest Zaman Talebi', action: () => {
                        if (!state.calendarChanges[day]) state.calendarChanges[day] = {};
                        state.calendarChanges[day].status = 'szt';
                        this.calendarSaveBtn.classList.remove('hidden');
                        this.render();
                    }});
                }
            }

            if (state.calendarChanges[day]) {
                 items.push({ label: 'Değişikliği İptal Et', action: () => {
                    delete state.calendarChanges[day];
                    if (Object.keys(state.calendarChanges).length === 0) this.calendarSaveBtn.classList.add('hidden');
                    this.render();
                }});
            }

            if(items.length > 0) utils.showModal(cell, items);
        },

        handleCalendarSave: async function() {
            const { state, utils } = window.ScheduleApp;
            const { currentYear: year, currentMonth: month } = state;
            const personId = state.currentUser.id;
            const isPublished = !!state.data.publishedSchedules?.[year]?.[month];
            const hasLockChange = Object.values(state.calendarChanges).some(change => change.hasOwnProperty('locked'));

            if (isPublished && hasLockChange) {
                let publishedData = utils.deepCopy(state.data.publishedSchedules[year][month]);
                for (const day in state.calendarChanges) {
                    const changes = state.calendarChanges[day];
                    if (changes.hasOwnProperty('note')) {
                        if (!state.data.notes[year]) state.data.notes[year] = {};
                        if (!state.data.notes[year][month]) state.data.notes[year][month] = {};
                        if (!state.data.notes[year][month][day]) state.data.notes[year][month][day] = {};
                        state.data.notes[year][month][day][personId] = changes.note;
                    }
                    if (changes.hasOwnProperty('locked')) {
                        if (!publishedData[day]) publishedData[day] = {};
                        if (!publishedData[day][personId]) publishedData[day][personId] = {};
                        const existingStatus = publishedData[day]?.[personId]?.status;
                        if(existingStatus) {
                             publishedData[day][personId] = { status: existingStatus, manual: changes.locked };
                        }
                    }
                }
                state.data.publishedSchedules[year][month] = publishedData;
                if (!state.data.draftSchedules[year]) state.data.draftSchedules[year] = {};
                state.data.draftSchedules[year][month] = utils.deepCopy(publishedData);
            } else {
                const draft = state.data.draftSchedules?.[year]?.[month];
                const published = state.data.publishedSchedules?.[year]?.[month];
                let monthToUpdate = utils.deepCopy(draft || published || {});
                
                for (const day in state.calendarChanges) {
                    if (!monthToUpdate[day]) monthToUpdate[day] = {};
                    if (state.currentUser.role === 'user' && !monthToUpdate[day][personId]) monthToUpdate[day][personId] = {};
                    const changes = state.calendarChanges[day];
                    
                    if (changes.hasOwnProperty('note')) {
                        if (!state.data.notes[year]) state.data.notes[year] = {};
                        if (!state.data.notes[year][month]) state.data.notes[year][month] = {};
                        if (!state.data.notes[year][month][day]) state.data.notes[year][month][day] = {};
                        state.data.notes[year][month][day][personId] = changes.note;
                    }
                    if (changes.hasOwnProperty('locked')) {
                        monthToUpdate[day][personId].manual = changes.locked;
                    }
                    if (changes.hasOwnProperty('status')) {
                         if (changes.status === null) {
                             if (monthToUpdate[day] && monthToUpdate[day][personId]) {
                                 delete monthToUpdate[day][personId];
                                 if (Object.keys(monthToUpdate[day]).length === 0) delete monthToUpdate[day];
                             }
                         } else {
                            monthToUpdate[day][personId] = { status: changes.status, manual: true };
                         }
                    }
                }
                if (!state.data.draftSchedules[year]) state.data.draftSchedules[year] = {};
                state.data.draftSchedules[year][month] = monthToUpdate;
            }

            await utils.saveDataToFirestore();
            state.calendarChanges = {};
            this.calendarSaveBtn.classList.add('hidden');
        },

        render: function() {
            const { state, utils, STATUSES, MONTH_NAMES, REQUEST_STATUSES } = window.ScheduleApp;
            if (!this.calendarContainer) return;

            let personId = state.currentUser?.role === 'user' ? state.currentUser.id : this.personSelector.value;
            if (state.currentUser?.role === 'user') this.personSelector.value = personId;

            const person = utils.getPeople(false).find(p => p.id === personId);
            const { currentYear: year, currentMonth: month } = state;
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const firstDayOfMonth = new Date(year, month, 1).getDay();
            const dayIndex = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
            const today = new Date();
            today.setHours(0,0,0,0);

            this.calendarContainer.innerHTML = '';

            const isPublished = state.tempScheduleData.isPublished || false;
            const scheduleExists = state.data.draftSchedules?.[year]?.[month] || state.data.publishedSchedules?.[year]?.[month];
            
            this.calendarPublishStatus.classList.remove('bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800');
            if (isPublished) {
                this.calendarPublishStatus.textContent = 'Yayında';
                this.calendarPublishStatus.classList.add('bg-green-100', 'text-green-800');
                this.calendarPublishStatus.classList.remove('hidden');
            } else if (scheduleExists) {
                this.calendarPublishStatus.textContent = 'Yayında Değil';
                this.calendarPublishStatus.classList.add('bg-red-100', 'text-red-800');
                this.calendarPublishStatus.classList.remove('hidden');
            } else {
                this.calendarPublishStatus.classList.add('hidden');
            }

            if (!person) {
                this.calendarTitle.textContent = 'Kişisel Takvim';
                this.calendarSummaries.innerHTML = '';
                this.calendarContainer.innerHTML = `<div class="text-center p-16 text-gray-500 bg-gray-50 rounded-lg">Lütfen takvimini görmek için bir kişi seçin.</div>`;
                return;
            }
            
            this.calendarTitle.textContent = `${person.name} - ${MONTH_NAMES[month]} ${year} Takvimi`;
            const scheduleData = state.tempScheduleData;

            let html = '<div class="calendar-grid">';
            ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].forEach(day => { html += `<div class="calendar-header">${day}</div>`; });
            
            for (let i = 0; i < dayIndex; i++) html += `<div class="calendar-day"></div>`;
            
            // Kişisel takvimin büyük kutularında okunabilirliği korumak için 
            // eski versiyondaki pastel renk paletini tutuyoruz.
            const calendarBgColors = {
                'O': '#bfdbfe', 'EgiO': '#bfdbfe', 'suzi': '#bfdbfe',
                'E': '#bbf7d0', 'EgiE': '#bbf7d0',
                'i': '#fecaca', 'iok': '#fecaca',
                'SZ': '#fed7aa', 'T': '#fef9c3',
                'izt': '#fee2e2', 'szt': '#ffedd5'
            };
            
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const isToday = (today.getDate() === day && today.getMonth() === month && today.getFullYear() === year);

                const currentStatusData = { ...scheduleData[day]?.[person.id] };
                const pendingChange = state.calendarChanges[day];
                
                if (pendingChange) {
                    if (pendingChange.hasOwnProperty('status')) {
                        if (pendingChange.status === null) {
                             delete currentStatusData.status;
                             delete currentStatusData.manual;
                        } else {
                            currentStatusData.status = pendingChange.status;
                        }
                    }
                    if (pendingChange.hasOwnProperty('locked')) currentStatusData.manual = pendingChange.locked;
                }
                
                const statusInfo = currentStatusData.status ? STATUSES[currentStatusData.status] : null;
                
                let bgCol = currentStatusData.status ? (calendarBgColors[currentStatusData.status] || '#ffffff') : '#ffffff';
                let statusText = statusInfo ? statusInfo.short : '';
                
                if(currentStatusData.status === 'szt') statusText = `SZ TALEP`;
                if(currentStatusData.status === 'izt') statusText = `İZİN TALEP`;
                
                let events = [];
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                if (scheduleData[day]?.oncall?.personId === person.id) events.push('<span class="event-item">Nöbet</span>');
                if (scheduleData[day]?.deploy?.personId === person.id) events.push(`<span class="event-item event-deploy">Deploy</span>`);
                
                const visitForDay = state.data.branchVisits?.find(v => v.date === dateStr && v.personId === person.id);
                if (visitForDay) events.push(`<span class="event-item event-visit">Ziyaret</span>`);
                
                const note = (pendingChange?.note !== undefined) ? pendingChange.note : (state.data.notes?.[year]?.[month]?.[day]?.[person.id] || '');
                if(note) events.push(`<span class="event-item event-note">Not: ${note}</span>`);
                if(currentStatusData.manual && !REQUEST_STATUSES.includes(currentStatusData.status)) events.push('<span class="event-item event-lock">Sabit</span>');
                
                let dayClasses = `calendar-day current-month ${date.getDay() % 6 === 0 ? "weekend-day" : ""}`;
                
                // Arka plan rengini inline-style olarak (style="...") vererek
                // ana dosyadaki index.html zorlayıcı renk sınıflarının burayı ezmesini engelliyoruz.
                html += `<div class="${dayClasses}" data-day="${day}" style="background-color: ${bgCol};">
                            <span class="day-number ${isToday ? 'today' : ''}">${day}</span>
                            <div class="watermark">${statusText}</div>
                            <div class="event-list">${events.join('')}</div>
                         </div>`;
            }
            html += '</div>';
            this.calendarContainer.innerHTML = html;
            
            this.renderPersonalCalendarSummaries(personId, year, month);
        },

        renderPersonalCalendarSummaries: function(personId, year, month) {
            const { state, utils } = window.ScheduleApp;
            if (!this.calendarSummaries) return;

            const allVisits = state.data.branchVisits || [];
            const personVisits = allVisits.filter(v => {
                if(!v.date || v.personId !== personId) return false;
                const visitDate = new Date(v.date);
                return visitDate.getFullYear() === year && visitDate.getMonth() === month;
            }).sort((a, b) => new Date(a.date) - new Date(b.date));
            
            const scheduleData = state.tempScheduleData || {};
            const deployData = state.data.deployData || [];
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            
            let personDeploys = [];
            for (let day = 1; day <= daysInMonth; day++) {
                if (scheduleData[day]?.deploy?.personId === personId) {
                    const date = new Date(year, month, day);
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    let eventData = deployData.find(d => d.date === dateStr) || { name: '(Belirtilmemiş)' };
                    personDeploys.push({ date: date, name: eventData.name, dateStr: dateStr });
                }
            }
            personDeploys.sort((a,b) => a.date - b.date);

            let visitHtml = '<div><h4 class="font-semibold mb-2 border-b pb-1">Bu Ayki Ziyaretleriniz</h4>';
            visitHtml += personVisits.length > 0 ? 
                `<div class="space-y-1 text-xs">${personVisits.map(v => `<p>${utils.formatSummaryDate(v.date)} - ${v.name || '(Belirtilmemiş)'} (${v.type})</p>`).join('')}</div>` : 
                '<p class="text-gray-500 text-xs">Bu ay için planlanmış ziyaretiniz yok.</p>';
            visitHtml += '</div>';

            let deployHtml = '<div><h4 class="font-semibold mb-2 border-b pb-1">Bu Ayki Deploy Görevleriniz</h4>';
            deployHtml += personDeploys.length > 0 ? 
                `<div class="space-y-1 text-xs">${personDeploys.map(d => `<p>${utils.formatSummaryDate(d.dateStr)} - ${d.name}</p>`).join('')}</div>` : 
                '<p class="text-gray-500 text-xs">Bu ay için planlanmış deploy göreviniz yok.</p>';
            deployHtml += '</div>';

            this.calendarSummaries.innerHTML = visitHtml + deployHtml;
        }
    };
})();