
        let appState = {
            //currentTrip: 'trip1',
            //currentDay: 'day1',
            //members: ['小蘇', '小一', '小二'],
            currentTripId: (typeof serverDefaultTripId !== 'undefined') ? serverDefaultTripId : 0,
            currentTrip: 'trip1',
            currentDay: 'day1',
            members: [], // 預設為空
            memberMap: {},
            categories: [],
            budgets: {
                trip1: { '小蘇': 5000, '小一': 5000, '小二': 5000 },
                trip2: { '小蘇': 5000, '小一': 5000, '小二': 5000 }
            },
            splitMode: 'avg',
            editingIndex: null,
            editingId: null,
            data: {
                trip1: { day1: [], day2: [] },
                trip2: { day1: [], day2: [] }
            }
        };

        //頁面載入後：顯示「新增支出」面板，計算並顯示今日統計資料
        //window.onload = () => {
        //    showPanel('addExpense');
        //    updateDashboard();
        //};

window.onload = () => {
    // 如果有 ID，就先去後端抓成員
    if (appState.currentTripId > 0) {
        fetchMembers(appState.currentTripId).then(() => {
            // 🔥 新增：預設載入第 1 天的支出
            loadDailyExpenses(appState.currentTripId, 1);
            showPanel('addExpense');
            updateDashboard();
        });
    } else {
        showPanel('addExpense');
        updateDashboard();
    }
};

        //function switchDay(trip, day, btn) {
        //    appState.currentTrip = trip;
        //    appState.currentDay = day;
        //    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        //    btn.classList.add('active');
        //    document.getElementById('current-title').innerText = `${trip === 'trip1' ? '旅程一' : '旅程二'} | ${day === 'day1' ? '第一天' : '第二天'}`;
        //    updateDashboard();
        //}

// 旅程 / 天數切換
function switchDay(tripId, dayKey, btn) {
    // 1. 更新全域狀態
    appState.currentTripId = tripId;
    appState.currentDay = dayKey;

    // 2. UI 樣式切換：移除舊的 active，幫當前按鈕加上 active
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 3. 取得行程名稱：從按鈕往上找到最近的 .trip-group 容器，再抓裡面的 h3
    const tripGroup = btn.closest('.trip-group');
    const tripTitle = tripGroup.querySelector('h3').innerText.trim();

    // 4. 取得天數文字：直接抓取按鈕上的文字 (例如 "第 1 天")
    const dayText = btn.innerText.trim();

    // 5. 更新主畫面標題
    document.getElementById('current-title').innerText = `${tripTitle} | ${dayText}`;

    // 6. [預留] 觸發後端資料載入 (AJAX)
    console.log(`切換至行程 ID: ${tripId}, 天數: ${dayKey}`);
    // loadDataFromServer(tripId, dayKey);

    // 🔥 新增：解析天數並載入資料
    const dayNum = parseInt(dayKey.replace('day', '')) || 1;
    loadDailyExpenses(tripId, dayNum);
}

        //右側功能面板切換
        async function showPanel(type) {
            document.querySelectorAll('.top-actions .action-btn').forEach(btn => btn.classList.remove('active-panel'));
            const activeBtn = document.getElementById(`btn-${type}`);
            if(activeBtn) activeBtn.classList.add('active-panel');

            const panel = document.getElementById('panel-content');
            if (type === 'members') {
                // 顯示載入中
                panel.innerHTML = '<p style="padding:20px;">資料讀取中...</p>';

                // 呼叫新寫的 fetchMembers (假設 appState.currentTripId 已經有值)
                // 如果你的 currentTripId 還沒設定好，可以先傳入預設值或檢查
                if (appState.currentTripId) {
                    await fetchMembers(appState.currentTripId);
                } else {
                    panel.innerHTML = '<p style="padding:20px;">請先選擇旅程</p>';
                }

            } else if (type === 'addExpense') {
                appState.editingIndex = null;
                renderAddForm(panel);
            } else if (type === 'summary') {
                renderTripSummary(panel);
            }

            // 如果是手機版，點擊按鈕後捲動到右側面板
            if (window.innerWidth <= 992) {
             document.querySelector('.right-panel').scrollIntoView({ behavior: 'smooth' });
            }
}
async function fetchMembers(tripId) {
    try {
        const timestamp = new Date().getTime();
        const response = await fetch(`/Accounting/GetTripMembers?tripId=${tripId}&t=${timestamp}`);

        const result = await response.json();

        // (1) 更新左側卡片的人數
        const countSpan = document.getElementById('member-count');
        if (countSpan) countSpan.innerText = result.count;

        // (2) 更新 appState (給記帳選單用) 
        appState.members = result.list.map(m => m.userName);
        // 🔥 新增：建立名字對 ID 的映射表 (存檔時要用)
        appState.memberMap = {};
        result.list.forEach(m => {
            appState.memberMap[m.userName] = m.userId;
        });

        // (3) 更新右側面板顯示成員列表
        const panel = document.getElementById('panel-content');
        if (panel && document.getElementById('btn-members').classList.contains('active-panel')) {
            // (這部分維持你原本的邏輯，或稍作美化)
            let html = `<h3>旅程成員 (${result.count}人)</h3><div style="margin-top:20px">`;
            html += result.list.map(m => `
            <div class="item-row">
             <span>${m.userName}</span>
                <button class="btn-edit" onclick="setPersonalBudget(${m.userId}, '${m.userName}', ${m.budget || 0})">設預算</button>
         </div>`
            ).join('');
            html += `</div>`;
            panel.innerHTML = html;
        }
        //  4. 重點新增：渲染「個人預算追蹤」卡片 (budget-list)
        const budgetList = document.getElementById('budget-list');
        if (budgetList) {
            if (result.list.length === 0) {
                budgetList.innerHTML = '<p style="color:#999; text-align:center;">尚無成員</p>';
            } else {
                budgetList.innerHTML = result.list.map(m => {
                    const spent = m.totalSpent || 0;
                    const budget = m.budget || 0;
                    // 如果有預算且花費超過預算，就標示為超支
                    const isOver = budget > 0 && spent > budget;

                    return `
                    <div class="budget-item" onclick="setPersonalBudget(${m.userId}, '${m.userName}', ${budget})" style="cursor:pointer; padding: 10px; border-bottom: 1px solid #eee;">
                        <div style="display:flex; justify-content:space-between; margin-bottom: 5px;">
                            <span style="font-weight:500; color: var(--text-dark);">${m.userName}</span>
                            <span style="font-size:14px; color: ${isOver ? '#ff5252' : '#64748b'}; font-weight: ${isOver ? 'bold' : 'normal'};">
                                NT$ ${Math.round(spent)} <span style="font-size:12px; color:#94a3b8;">/ ${Math.round(budget)}</span>
                            </span>
                        </div>
                        <div style="width: 100%; height: 6px; background-color: #f1f5f9; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${budget > 0 ? Math.min((spent / budget) * 100, 100) : 0}%; height: 100%; background-color: ${isOver ? '#ff5252' : 'var(--mint-green)'}; transition: width 0.3s;"></div>
                        </div>
                    </div>`;
                }).join('');
            }
        }

    } catch (error) {
        console.error('讀取成員失敗', error);
        alert('無法載入成員列表');
    }

    window.onload = () => {
        // 1. 啟動時順便抓類別
        fetchCategories();

        if (appState.currentTripId > 0) {
            fetchMembers(appState.currentTripId).then(() => {
                loadDailyExpenses(appState.currentTripId, 1);
            });
        }
        showPanel('addExpense');
    };

    // 🔥 新增：從後端撈取類別清單
    async function fetchCategories() {
        try {
            const response = await fetch('/Accounting/GetCategories');
            if (response.ok) {
                appState.categories = await response.json();
                // 如果資料庫是空的，給一些預設值避免壞掉
                if (appState.categories.length === 0) {
                    appState.categories = ['食物', '交通', '住宿', '其他'];
                }
            }
        } catch (err) {
            console.error('類別載入失敗', err);
            appState.categories = ['食物', '交通', '住宿', '其他']; // 發生錯誤時的備案
        }
    }

    // 新增：設定個人預算的函式 (呼叫後端 API)
    async function setPersonalBudget(userId, userName, currentBudget) {
        const newBudget = prompt(`設定 ${userName} 的旅程預算:`, currentBudget);

        // 檢查輸入是否為有效數字
        if (newBudget !== null && !isNaN(newBudget) && newBudget.trim() !== '') {
            try {
                // 使用 Form Data 傳送資料
                const formData = new URLSearchParams();
                formData.append('tripId', appState.currentTripId);
                formData.append('userId', userId);
                formData.append('budget', newBudget);

                const response = await fetch('/Accounting/UpdateBudget', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData
                });

                if (response.ok) {
                    // 更新成功後，重新撈取資料以更新畫面
                    await fetchMembers(appState.currentTripId);
                } else {
                    alert('更新失敗，請稍後再試');
                }
            } catch (err) {
                console.error(err);
                alert('發生錯誤');
            }
        }
    }
}



        //新增 / 編輯支出表單
        function renderAddForm(container, editData = null) {
            const isEdit = editData !== null;
            container.innerHTML = `
                <h3>${isEdit ? '編輯支出' : '新增支出'}</h3>
                <div class="form-group">
                <label>項目名稱</label>
                <input type="text" id="exp-name" value="${isEdit ? editData.name : ''}" placeholder="例如：晚餐"></div>
                <div class="form-group"><label>類別</label>
    <select id="exp-cat">
        ${appState.categories.map(c =>
            `<option ${isEdit && editData.cat === c ? 'selected' : ''}>${c}</option>`
        ).join('')}
    </select>
</div>
                <div class="form-group">
                    <label>付款人 (實際出錢)</label>
                    ${appState.members.map(m => `<div class="checkbox-row"><input type="checkbox" class="pay-check" ${isEdit && editData.payers[m]?'checked':''} value="${m}" onchange="updatePayTotal()"><span>${m}</span><input type="number" class="pay-amt" data-user="${m}" value="${isEdit && editData.payers[m]?editData.payers[m]:''}" placeholder="金額" oninput="updatePayTotal()"></div>`).join('')}
                </div>
                <div class="total-info">付款總額：NT$ <span id="pay-total-val">${isEdit?editData.total:0}</span></div>
                <div class="form-group">
                    <label>參與分攤成員</label>
                    <div class="mode-switch">
                        <button id="mode-avg" class="mode-btn ${appState.splitMode==='avg'?'active':''}" onclick="changeSplitMode('avg')">平均分攤</button>
                        <button id="mode-custom" class="mode-btn ${appState.splitMode==='custom'?'active':''}" onclick="changeSplitMode('custom')">自定義金額</button>
                    </div>
                    ${appState.members.map(m => `<div class="checkbox-row"><input type="checkbox" class="part-check" ${isEdit && editData.parts[m]?'checked':''} value="${m}" onchange="handlePartCheck()"><span>${m}</span><input type="number" class="part-amt" data-user="${m}" value="${isEdit && editData.parts[m]?editData.parts[m]:''}" placeholder="0" ${appState.splitMode==='avg'?'disabled':''} oninput="updateSplitTotal()"></div>`).join('')}
                </div>
                <div class="total-info blue">分攤總額：NT$ <span id="split-total-val">${isEdit?editData.total:0}</span></div>
                <button class="confirm-btn" onclick="saveExpense()">${isEdit ? '更新支出' : '確認新增'}</button>`;
            if(isEdit) updatePayTotal();
}

        //付款金額計算
        function updatePayTotal() {
            let t = 0; document.querySelectorAll('.pay-amt').forEach(i => t += Number(i.value) || 0);
            document.getElementById('pay-total-val').innerText = t;
            if(appState.splitMode === 'avg') calcAverageSplit();
}

        //分攤模式切換
        function changeSplitMode(mode) {
            appState.splitMode = mode;
            document.getElementById('mode-avg').classList.toggle('active', mode === 'avg');
            document.getElementById('mode-custom').classList.toggle('active', mode === 'custom');
            document.querySelectorAll('.part-amt').forEach(input => input.disabled = (mode === 'avg'));
            if(mode === 'avg') calcAverageSplit();
        }
        //勾選 / 取消勾選「參與分攤的人」就會觸發
        function handlePartCheck() {
            // 平均分攤 → 重新計算每人金額
            if (appState.splitMode === 'avg') calcAverageSplit();
            // 自訂金額 → 只更新總額
            else updateSplitTotal();
        }

        //平均分攤計算
        function calcAverageSplit() {
            if(appState.splitMode !== 'avg') return;
            const total = Number(document.getElementById('pay-total-val').innerText);
            const checked = document.querySelectorAll('.part-check:checked');
            const avg = checked.length > 0 ? (total / checked.length).toFixed(1) : 0;
            document.querySelectorAll('.part-check').forEach((cb, idx) => {
                const amtInp = document.querySelectorAll('.part-amt')[idx];
                amtInp.value = cb.checked ? avg : '';
            });
            updateSplitTotal();
        }
        //把所有有勾選的 分攤金額輸入框 的數字加起來，顯示成分攤總額
        function updateSplitTotal() {
            let t = 0;
            document.querySelectorAll('.part-check:checked')
                .forEach(cb => {
                    const amt = cb.closest('.checkbox-row')
                        .querySelector('.part-amt').value;
                    t += Number(amt) || 0;
                });
            document.getElementById('split-total-val').innerText = t.toFixed(1);
}

// 🔥 新增：從後端撈取每日支出
async function loadDailyExpenses(tripId, day) {
    try {
        const timestamp = new Date().getTime();
        const response = await fetch(`/Accounting/GetDailyExpenses?tripId=${tripId}&day=${day}&t=${timestamp}`);
        const result = await response.json();

        // 將後端回傳的資料，塞回 appState 的結構中
        if (!appState.data[`trip${tripId}`]) appState.data[`trip${tripId}`] = {};
        appState.data[`trip${tripId}`][`day${day}`] = result;

        // 為了相容舊程式碼結構，更新 currentTrip 指標
        appState.currentTrip = `trip${tripId}`;

        // 更新畫面
        updateDashboard();

    } catch (error) {
        console.error("載入支出失敗", error);
    }
}

// 儲存支出 (整合新增與更新)
async function saveExpense() {
    const name = document.getElementById('exp-name').value;
    const cat = document.getElementById('exp-cat').value;
    const totalPay = Number(document.getElementById('pay-total-val').innerText);
    const totalSplit = Number(document.getElementById('split-total-val').innerText);

    if (!name || totalPay <= 0) return alert('請填寫名稱與金額');
    if (Math.abs(totalPay - totalSplit) > 1) return alert('金額不符 (付款 != 分攤)！');

    // 收集資料 (轉 ID)
    let payers = {};
    document.querySelectorAll('.pay-amt').forEach(i => {
        if (Number(i.value) > 0) payers[appState.memberMap[i.dataset.user]] = Number(i.value);
    });

    let participants = {};
    document.querySelectorAll('.part-amt').forEach(i => {
        if (Number(i.value) > 0) participants[appState.memberMap[i.dataset.user]] = Number(i.value);
    });

    // 判斷 API 路徑與資料包
    let url = '/Accounting/CreateExpense';
    let payload = {
        TripId: appState.currentTripId,
        Day: parseInt(appState.currentDay.replace('day', '')) || 1,
        Title: name,
        CategoryName: cat,
        TotalAmount: totalPay,
        Payers: payers,
        Participants: participants
    };

    // 🔥 如果是編輯模式，改呼叫 UpdateExpense
    if (appState.editingId) {
        url = '/Accounting/UpdateExpense';
        payload.ExpenseId = appState.editingId; // 加入 ID
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert(appState.editingId ? '更新成功！' : '新增成功！');

            // 重置編輯狀態
            appState.editingId = null;
            appState.editingIndex = null;

            // 重新載入資料
            const dayNum = parseInt(appState.currentDay.replace('day', '')) || 1;
            loadDailyExpenses(appState.currentTripId, dayNum);
            fetchMembers(appState.currentTripId);
            showPanel('addExpense'); // 重置表單
        } else {
            alert('儲存失敗，請檢查資料');
        }
    } catch (err) {
        console.error(err);
        alert('連線錯誤');
    }
}
        //儀表板更新
        function updateDashboard() {
            const dayData = appState.data[appState.currentTrip][appState.currentDay];
            // 1. 今日支出總額、筆數
            document.getElementById('total-amount').innerText = dayData.reduce((s, i) => s + i.total, 0);
            document.getElementById('expense-count').innerText = dayData.length;
            
            //document.getElementById('budget-list').innerHTML = appState.members.map(m => {
            //    const spent = Object.values(appState.data[appState.currentTrip]).flat().reduce((s,e)=>s+(e.parts[m]||0),0);
            //    const budget = appState.budgets[appState.currentTrip][m];
            //    return `<div class="budget-item" onclick="setPersonalBudget('${m}')" style="cursor:pointer"><div style="font-size:12px;color:#64748b">${m}</div><div class="${spent>budget?'over-budget':''}">NT$ ${spent.toFixed(0)} <span style="font-size:11px;color:#94a3b8">/ ${budget}</span></div></div>`;
            //}).join('');

            // 2. 支出清單
            document.getElementById('expense-list').innerHTML = dayData.map((e, idx) =>
                `<div class="item-row"><div><b>[${e.cat}]</b> ${e.name}<div style="font-size:12px;color:#94a3b8">NT$ ${e.total}</div></div><div><button class="btn-edit" onclick="editExpense(${idx})">編</button><button class="btn-delete" onclick="deleteExpense(${idx})">刪</button></div></div>`
            ).join('');

            // 3. 債務清單
            renderBalance(dayData, document.getElementById('debt-list'));
}

// 編輯支出
function editExpense(idx) {
    appState.editingIndex = idx;

    // 取得該筆支出的資料
    // 注意：appState.data 是我們在 loadDailyExpenses 裡填入的，裡面已經有 id 了
    const data = appState.data[appState.currentTrip][appState.currentDay][idx];

    appState.editingId = data.id; // 🔥 記錄資料庫的 ExpenseId

    showPanel('addExpense');
    renderAddForm(document.getElementById('panel-content'), data);
}

// 刪除支出
async function deleteExpense(idx) {
    if (!confirm('確定刪除？')) return;

    // 1. 取得 ID
    const data = appState.data[appState.currentTrip][appState.currentDay][idx];
    const expenseId = data.id;

    try {
        // 2. 呼叫後端 API
        const response = await fetch(`/Accounting/DeleteExpense?expenseId=${expenseId}`, {
            method: 'POST'
        });

        if (response.ok) {
            // 3. 成功後重新整理畫面
            const dayNum = parseInt(appState.currentDay.replace('day', '')) || 1;
            loadDailyExpenses(appState.currentTripId, dayNum);
            fetchMembers(appState.currentTripId); // 更新預算條
        } else {
            alert('刪除失敗');
        }
    } catch (err) {
        console.error(err);
        alert('刪除錯誤');
    }
}

        //個人預算設定
// 設定個人預算的函式 (呼叫後端 API)
async function setPersonalBudget(userId, userName, currentBudget) {
    // 1. 跳出輸入視窗
    const newBudget = prompt(`設定 ${userName} 的旅程預算:`, currentBudget);

    // 2. 檢查輸入是否有效 (不是取消，也不是空值)
    if (newBudget !== null && !isNaN(newBudget) && newBudget.trim() !== '') {
        try {
            // 3. 準備要傳送的資料
            const formData = new URLSearchParams();
            formData.append('tripId', appState.currentTripId); // 確保這裡有拿到目前的 TripId
            formData.append('userId', userId);
            formData.append('budget', newBudget);

            // 4. 發送 POST 請求給後端
            const response = await fetch('/Accounting/UpdateBudget', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });

            // 5. 處理結果
            if (response.ok) {
                // 更新成功後，重新去後端撈一次最新的成員資料，讓畫面更新
                await fetchMembers(appState.currentTripId);
            } else {
                alert('更新失敗，請稍後再試');
            }
        } catch (err) {
            console.error(err);
            alert('發生錯誤');
        }
    }
}

        //債務結算
        function renderBalance(list, container) {
            let bal = {}; appState.members.forEach(m => bal[m] = 0);
            list.forEach(e => { appState.members.forEach(m => { bal[m] += (e.payers[m] || 0); bal[m] -= (e.parts[m] || 0); }); });
            container.innerHTML = appState.members.map(m => `<div class="item-row" style="border:none;"><span>${m}</span><span class="${bal[m]>=0?'receivable':'owed'}">${bal[m]>=0?'應收':'欠款'} NT$ ${Math.abs(bal[m]).toFixed(1)}</span></div>`).join('');
        }
        //旅程結算
        function renderTripSummary(container) {
            const all = Object.values(appState.data[appState.currentTrip]).flat();
            container.innerHTML = `<h3>全旅程結算</h3><div id="sum-list"></div><div class="card" style="margin-top:20px"><h4>全旅程總支出</h4><div class="value highlight">NT$ ${all.reduce((s,i)=>s+i.total,0)}</div></div>`;
            renderBalance(all, document.getElementById('sum-list'));
        }
        
        
        
        
        let isLoggedIn = false;

        // 手機版菜單展開/收合
        function toggleMobileMenu(event) {
            event.stopPropagation();
            document.getElementById('navMenu').classList.toggle('show');
        }

        // 登入狀態切換邏輯
        function toggleLogin() {
            isLoggedIn = !isLoggedIn;
            const navAuth = document.getElementById('navAuth');

            if (isLoggedIn) {
                // 登入後的畫面：顯示頭像與下拉選單
                navAuth.innerHTML = `
                    <div style="position:relative;">
                        <img id="userAvatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" onclick="toggleMenu(event)">
                        <div id="userMenu" class="dropdown-menu">
                            <div class="menu-group-title">會員中心</div>
                            <a href="#"><i class="fa-regular fa-circle-user"></i> 個人資料</a>
                            <a href="#"><i class="fa-regular fa-calendar-check"></i> 媒合行事曆</a>
                            <div class="menu-divider"></div>
                            <div class="menu-group-title">我的行程</div>
                            <a href="#"><i class="fa-solid fa-suitcase"></i> 查看所有行程</a>
                            <a href="#" onclick="toggleLogin()" style="color:#ff5252;"><i class="fa-solid fa-right-from-bracket"></i> 登出</a>
                        </div>
                    </div>`;
            } else {
                // 未登入畫面
                navAuth.innerHTML = `
                    <a href="#" class="btn-text">註冊</a>
                    <button class="btn-login-nav" onclick="toggleLogin()">登入</button>`;
            }
        }

        // 切換頭像下拉選單
        function toggleMenu(event) {
            event.stopPropagation();
            const menu = document.getElementById('userMenu');
            if (menu) {
                menu.style.display = (menu.style.display === 'flex') ? 'none' : 'flex';
            }
        }

        // 點擊頁面其他地方時，自動關閉所有開啟的選單
        window.onclick = function (event) {
            const userMenu = document.getElementById('userMenu');
            const navMenu = document.getElementById('navMenu');
            
            // 關閉頭像選單
            if (userMenu && event.target.id !== 'userAvatar') {
                userMenu.style.display = 'none';
            }
            
            // 關閉手機版選單
            if (navMenu && !event.target.classList.contains('menu-toggle')) {
                navMenu.classList.remove('show');
            }
        }
