
let autoRefreshInterval = null;

// 1. Inicializa: Carrega o Select e a eleição ativa
async function init() {
    await loadHistoryOptions();
    loadActiveElection(); // Padrão ao abrir
}

// 2. Carrega as opções do Dropdown (Ativa + Histórico)
async function loadHistoryOptions() {
    const select = document.getElementById('history-select');
    
    // Busca histórico
    const resHistory = await fetch('/api/public/history-list');
    const history = await resHistory.json();

    // Limpa e adiciona opção "AO VIVO"
    select.innerHTML = `<option value="active">🔴 AO VIVO (Votação Atual)</option>`;

    // Adiciona as passadas
    history.forEach(h => {
        const date = new Date(h.end_time).toLocaleDateString('pt-BR');
        const option = document.createElement('option');
        option.value = h.id;
        option.innerText = `📜 ${date} - ${h.title}`;
        select.appendChild(option);
    });
}

// 3. Função chamada quando troca o Select
function changeView() {
    const select = document.getElementById('history-select');
    const value = select.value;

    // Se for histórico, para de atualizar sozinho
    if (value !== 'active') {
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        loadSpecificElection(value);
    } else {
        loadActiveElection();
    }
}

// 4. Carrega a Eleição ATIVA (Com auto-refresh)
async function loadActiveElection() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    
    async function fetchActive() {
        const response = await fetch('/api/public/active');
        const data = await response.json();
        
        if (data.active) {
            renderPage(data.title, data.candidates);
        } else {
            document.getElementById('election-title').innerText = "Nenhuma votação ativa";
            document.getElementById('results-list').innerHTML = "";
            document.getElementById('total-votes-display').innerText = "";
        }
    }

    fetchActive();
    autoRefreshInterval = setInterval(fetchActive, 5000); // Atualiza a cada 5s
}

// 5. Carrega uma Eleição ANTIGA (Sem refresh)
async function loadSpecificElection(id) {
    const response = await fetch(`/api/public/election/${id}`);
    const data = await response.json();
    renderPage(data.title + " (Encerrada)", data.candidates);
}

// 6. Desenha a tela (Comum para os dois casos)
function renderPage(title, candidates) {
    document.getElementById('election-title').innerText = title;
    const list = document.getElementById('results-list');

    if (!candidates || candidates.length === 0) {
        list.innerHTML = "<p>Sem dados.</p>";
        return;
    }

    // Ordena e calcula totais
    const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
    document.getElementById('total-votes-display').innerText = `Total de Votos: ${totalVotes}`;
    
    // Se for histórico, os candidatos já vêm ordenados do banco, 
    // mas se for a ativa, garantimos a ordenação aqui:
    candidates.sort((a, b) => b.votes - a.votes);

    list.innerHTML = candidates.map((c, index) => {
        const percentage = totalVotes === 0 ? 0 : ((c.votes / totalVotes) * 100).toFixed(1);
        // O primeiro da lista é o vencedor
        const isWinner = index === 0 && c.votes > 0 ? 'winner' : ''; 

        return `
            <div class="result-card ${isWinner}">
                <div class="rank">#${index + 1}</div>
                <img src="${c.photo}" class="mini-photo">
                <div class="info">
                    <div class="name">${c.name} ${isWinner ? '👑' : ''}</div>
                    <div class="progress-bg">
                        <div class="progress-bar" style="width: ${percentage}%">${percentage}%</div>
                    </div>
                    <div class="stats">${c.votes} votos</div>
                </div>
            </div>
        `;
    }).join('');
}

init();