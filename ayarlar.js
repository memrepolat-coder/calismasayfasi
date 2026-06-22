(function() {
    window.ScheduleApp.modules.settings = {
        init: function() {
            const container = document.getElementById('settings-module-container');
            if (!container) return;

            // Ayarlar modülünün HTML yapısını enjekte et
            container.innerHTML = `
                <h3 class="text-lg font-semibold mb-4">Kişi Yönetimi</h3>
                 <div class="table-container">
                    <table id="people-management-table" class="w-full text-sm">
                       <thead>
                            <tr class="bg-gray-100">
                                <th class="p-2 border w-16">Sıra</th>
                                <th class="p-2 border">İsim</th>
                                <th class="p-2 border">Şifre</th>
                                <th class="p-2 border">İşe Başlama</th>
                                <th class="p-2 border">İşten Ayrılma</th>
                                <th class="p-2 border w-24">Eylemler</th>
                            </tr>
                       </thead>
                       <tbody></tbody>
                    </table>
                 </div>
                 <div class="mt-4 flex justify-end">
                    <button id="add-person-btn" class="font-semibold text-sm py-2 px-4 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors shadow-sm">Yeni Kişi Ekle</button>
                </div>
            `;

            // DOM Elementlerini Önbelleğe Al
            this.tableBody = container.querySelector('#people-management-table tbody');
            this.addPersonBtn = container.querySelector('#add-person-btn');

            // Event Listener Ekle
            this.addPersonBtn.addEventListener('click', () => this.handleAddNewPerson());

            this.missing = false; // Modülün yüklendiğini belirtir
        },

        render: function() {
            const { state, utils } = window.ScheduleApp;
            
            // Sadece yönetici görebilir ve tablo yüklenmiş olmalıdır
            if (!state.currentUser || state.currentUser.role !== 'admin' || !this.tableBody) return;

            const people = utils.getPeople(); // İsimleri sıralı getir

            this.tableBody.innerHTML = people.map(person => `
                <tr data-id="${person.id}">
                    <td class="p-1 border">
                        <input type="number" class="order-input w-16 text-center bg-transparent border border-gray-300 rounded-md p-1" value="${person.order}">
                    </td>
                    <td class="p-1 border">
                        <input type="text" class="name-input w-full bg-transparent border border-gray-300 rounded-md p-1" value="${person.name}">
                    </td>
                    <td class="p-1 border">
                        <input type="password" class="password-input w-full bg-transparent border border-gray-300 rounded-md p-1" value="${person.password || ''}" placeholder="Şifre belirle...">
                    </td>
                    <td class="p-1 border">
                        <input type="date" class="start-date-input w-full bg-transparent border border-gray-300 rounded-md p-1 text-xs sm:text-sm" value="${person.startDate || ''}">
                    </td>
                    <td class="p-1 border">
                        <input type="date" class="end-date-input w-full bg-transparent border border-gray-300 rounded-md p-1 text-xs sm:text-sm" value="${person.endDate || ''}">
                    </td>
                    <td class="p-1 border text-center whitespace-nowrap">
                        <button class="save-person-btn bg-green-500 text-white p-2 rounded-md hover:bg-green-600 transition-all" title="Kaydet">✓</button>
                        <button class="delete-person-btn bg-red-500 text-white p-2 rounded-md hover:bg-red-600 ml-1 transition-all" title="Sil">✖</button>
                    </td>
                </tr>
            `).join('');

            // Dinamik olarak oluşturulan butonlara event listener ekleme
            this.tableBody.querySelectorAll('.save-person-btn').forEach(btn => {
                btn.addEventListener('click', (e) => this.handleSavePerson(e));
            });
            this.tableBody.querySelectorAll('.delete-person-btn').forEach(btn => {
                btn.addEventListener('click', (e) => this.handleDeletePerson(e));
            });
        },

        handleSavePerson: async function(e) {
            const { state, utils } = window.ScheduleApp;
            const tr = e.target.closest('tr');
            const person = state.data.peopleData.find(p => p.id === tr.dataset.id);
            
            if (person) {
                person.order = parseInt(tr.querySelector('.order-input').value) || 0;
                person.name = tr.querySelector('.name-input').value;
                person.password = tr.querySelector('.password-input').value;
                person.startDate = tr.querySelector('.start-date-input').value || null;
                person.endDate = tr.querySelector('.end-date-input').value || null;
                
                await utils.saveDataToFirestore();
                utils.showInfoModal('Başarılı', `'${person.name}' kişisi başarıyla güncellendi.`);
            }
        },

        handleDeletePerson: function(e) {
            const { state, utils } = window.ScheduleApp;
            const tr = e.target.closest('tr');
            const person = state.data.peopleData.find(p => p.id === tr.dataset.id);
            
            if (person) {
                utils.showConfirmModal('Kişiyi Sil', `'${person.name}' adlı kişiyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`, async () => {
                    state.data.peopleData = state.data.peopleData.filter(p => p.id !== person.id);
                    await utils.saveDataToFirestore();
                });
            }
        },
        
        handleAddNewPerson: async function() {
            const { state, utils } = window.ScheduleApp;
            
            // Kişiler arasındaki en yüksek "Sıra" numarasını bulup 1 ekliyoruz
            const maxOrder = state.data.peopleData.length > 0 
                ? Math.max(...state.data.peopleData.map(p => p.order)) 
                : 0;
                
            state.data.peopleData.push({
                id: crypto.randomUUID(), 
                name: 'Yeni Kişi', 
                password: '', 
                startDate: null, 
                endDate: null, 
                order: maxOrder + 1
            });
            
            await utils.saveDataToFirestore();
        }
    };
})();