// frontend/src/dice.js
export function initDice(socket, lobbyId, inputType, inputCount, rollBtn) {
  rollBtn.addEventListener('click', () => {
    const type = inputType.value, count = inputCount.value;
    socket.emit('rollDice', { lobbyId, diceType: type, diceCount: count }, res => {
      if (res.error) console.error(res.error);
    });
  });
}

document.getElementById("rollDice").addEventListener("click", function () {
    const diceType = document.getElementById("diceType").value;
    const diceCount = parseInt(document.getElementById("diceCount").value, 10);
    const resultsDiv = document.getElementById("diceResults");

    let results = [];
    let total = 0;

    for (let i = 0; i < diceCount; i++) {
        let roll = Math.floor(Math.random() * diceType) + 1;
        results.push(roll);
        total += roll;
    }

    resultsDiv.innerHTML = `<p>Результаты: ${results.join(", ")}</p>
                            <p>Сумма: ${total}</p>`;
});
