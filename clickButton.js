async function clickButton(page, buttonNames) {
    await page.evaluate((buttonNames) => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        for (const buttonName of buttonNames) {
            const matchingButton = buttons.find(button => {
                const text = button.textContent.trim();
                return text === buttonName || text.includes(buttonName);
            });
            if (matchingButton) {
                matchingButton.click();
                break; // Exit the loop after clicking the first matching button
            }
        }
    }, buttonNames);
}

module.exports = { clickButton };