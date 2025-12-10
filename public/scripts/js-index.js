
let currentElectionId = null;
let timerInterval = null;

async function loadData() {
    try {
        const response = await fetch('/api/public/active');
        const data = await response.json();
        
        const grid = document.getElementById('candidates-grid');
        const noElection = document.getElementById('no-election');
        const timerBox = document.getElementById('timer-box');
        
        if (!data.active) {
            document.getElementById('page-title').innerText = "Votação Encerrada";
            document.getElementById('page-subtitle').style.display = 'none';
            timerBox.style.display = 'none';
            grid.style.display = 'none';
            noElection.style.display = 'block';
            return;
        }

        currentElectionId = data.id;
        document.getElementById('page-title').innerText = data.title;
        document.getElementById('page-subtitle').innerText = "Toque na foto para votar.";
        document.getElementById('page-subtitle').style.display = 'block';
        grid.style.display = 'grid';
        noElection.style.display = 'none';
        grid.innerHTML = '';

        // Inicia Cronômetro
        startCountdown(data.endTime);

        data.candidates.forEach(c => {
            const card = document.createElement('div');
            card.className = 'card';
            card.onclick = () => confirmVote(c.id, c.name);
            
            card.innerHTML = `
                <div class="photo-container">
                    <img src="${c.photo}" alt="${c.name}">
                </div>
                <h3>${c.name}</h3>
                <button class="btn-votar">Votar</button>
            `;
            grid.appendChild(card);
        });
    } catch (e) {
        console.error("Erro ao carregar:", e);
    }
}

function startCountdown(endTimeStr) {
    const timerBox = document.getElementById('timer-box');
    const countdownEl = document.getElementById('countdown');
    timerBox.style.display = 'block';

    if (timerInterval) clearInterval(timerInterval);

    function update() {
        const now = new Date().getTime();
        const end = new Date(endTimeStr).getTime();
        const distance = end - now;

        if (distance < 0) {
            clearInterval(timerInterval);
            timerBox.innerHTML = "🚫 VOTAÇÃO ENCERRADA";
            timerBox.style.backgroundColor = "#c0392b";
            setTimeout(() => location.reload(), 2000);
            return;
        }

        // Mantemos os Dias (caso a votação dure mais de 24h)
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const minutes = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60));
        
        // Segundos continua igual
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        let text = "";
        if (days > 0) text += `${days}d `;
        
        // Formatação visual: Adicionei um '0' na frente dos segundos para ficar bonito (ex: 05s)
        text += `${minutes}m ${seconds < 10 ? '0' + seconds : seconds}s`;
        
        countdownEl.innerText = text;
    }

    update();
    timerInterval = setInterval(update, 1000);
}

function confirmVote(id, name) {
    Swal.fire({
        title: 'Confirmar voto?',
        text: `Seu voto irá para ${name}.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2ecc71',
        confirmButtonText: 'Confirmar'
    }).then((result) => {
        if (result.isConfirmed) sendVote(id);
    });
}

async function sendVote(candidateId) {
    try {
        const response = await fetch('/api/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidateId, electionId: currentElectionId })
        });

        const result = await response.json();

        if (response.ok) {
            // --- CASO 1: VOTO COMPUTADO COM SUCESSO ---
            Swal.fire({
                title: 'Voto Confirmado!',
                text: 'Redirecionando...',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            }).then(() => {
                window.location.href = 'results.html';
            });

        } else {

            // Agora também redireciona após o aviso
            Swal.fire({
                title: 'Atenção',
                text: result.message, // Ex: "Você já votou nesta eleição"
                icon: 'error',
                confirmButtonText: 'Ver Resultados' // Botão sugere o que vai acontecer
            }).then(() => {
                // AQUI ESTÁ A MUDANÇA: Redireciona mesmo com erro
                window.location.href = 'results.html'; 
            });
        }

    } catch (error) {
        console.error(error);
        Swal.fire('Erro', 'Falha na conexão.', 'error');
    }
}
loadData();