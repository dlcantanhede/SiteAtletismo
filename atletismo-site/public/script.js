// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-inscricao');
    const statusMessage = document.getElementById('status-message');
    const submitButton = document.getElementById('submit-btn');

    form.addEventListener('submit', async (event) => {
        // Previne o envio padrão do formulário
        event.preventDefault();

        // Desabilita o botão para evitar múltiplos cliques
        submitButton.disabled = true;
        submitButton.textContent = 'Processando...';
        statusMessage.textContent = '';

        // Coleta os dados do formulário
        const formData = {
            nome: document.getElementById('nome').value,
            cpf: document.getElementById('cpf').value,
            idade: document.getElementById('idade').value,
            cidade: document.getElementById('cidade').value,
        };

        try {
            // Envia os dados para o back-end usando a API Fetch
            const response = await fetch('/criar-pagamento', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                throw new Error('Falha na comunicação com o servidor.');
            }

            const data = await response.json();

            // Se tudo deu certo, redireciona o usuário para o link de pagamento
            if (data.init_point) {
                window.location.href = data.init_point;
            } else {
                throw new Error('Link de pagamento não recebido.');
            }

        } catch (error) {
            // Em caso de erro, reabilita o botão e mostra uma mensagem
            console.error("Erro no processo de inscrição:", error);
            statusMessage.textContent = 'Ocorreu um erro. Por favor, tente novamente.';
            submitButton.disabled = false;
            submitButton.textContent = 'Inscrever e Pagar R$125,50';
        }
    });
});