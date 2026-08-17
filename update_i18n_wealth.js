const fs = require('fs');
let content = fs.readFileSync('/Users/sarthakmathapati/Desktop/skens-code-git/Full_stack_project/9-BudgetTracker/frontend/src/services/i18n.js', 'utf8');

const newEn = `    liquid_assets: 'Liquid Assets',
    physical_assets: 'Physical Assets',
    liabilities: 'Liabilities',
    assets_and_liabilities: 'Assets & Liabilities',
    add_asset_liability: 'Add Asset / Liability',
    net_worth: 'Net Worth',
    total_assets: 'Total Assets',
    total_liabilities: 'Total Liabilities',
    no_wealth_items: 'No wealth items tracked.',
    add_wealth_items_desc: 'Add your bank accounts, investments, or loans to calculate your net worth.',
    add_wealth_item: 'Add Wealth Item',
    delete_item: 'Delete Item?',
    are_you_sure_delete_item: 'Are you sure you want to remove',
    affect_net_worth: 'This will affect your net worth calculations.',
`;

const newHi = `    liquid_assets: 'तरल संपत्ति',
    physical_assets: 'भौतिक संपत्ति',
    liabilities: 'देनदारियाँ',
    assets_and_liabilities: 'संपत्ति और देनदारियाँ',
    add_asset_liability: 'संपत्ति / देनदारी जोड़ें',
    net_worth: 'शुद्ध संपत्ति',
    total_assets: 'कुल संपत्ति',
    total_liabilities: 'कुल देनदारियाँ',
    no_wealth_items: 'कोई संपत्ति ट्रैक नहीं की गई।',
    add_wealth_items_desc: 'अपनी शुद्ध संपत्ति की गणना करने के लिए अपने बैंक खाते, निवेश या ऋण जोड़ें।',
    add_wealth_item: 'संपत्ति जोड़ें',
    delete_item: 'आइटम हटाएं?',
    are_you_sure_delete_item: 'क्या आप वाकई हटाना चाहते हैं',
    affect_net_worth: 'इससे आपकी शुद्ध संपत्ति की गणना प्रभावित होगी।',
`;

const newMr = `    liquid_assets: 'तरल मालमत्ता',
    physical_assets: 'भौतिक मालमत्ता',
    liabilities: 'देयता',
    assets_and_liabilities: 'मालमत्ता आणि देयता',
    add_asset_liability: 'मालमत्ता / देयता जोडा',
    net_worth: 'निव्वळ संपत्ती',
    total_assets: 'एकूण मालमत्ता',
    total_liabilities: 'एकूण देयता',
    no_wealth_items: 'कोणतीही मालमत्ता ट्रॅक केलेली नाही.',
    add_wealth_items_desc: 'तुमची निव्वळ संपत्ती मोजण्यासाठी तुमची बँक खाती, गुंतवणूक किंवा कर्ज जोडा.',
    add_wealth_item: 'मालमत्ता जोडा',
    delete_item: 'आयटम हटवायचा?',
    are_you_sure_delete_item: 'तुम्हाला खात्री आहे की तुम्हाला काढायचे आहे',
    affect_net_worth: 'याचा तुमच्या निव्वळ संपत्तीच्या गणनेवर परिणाम होईल.',
`;

const newBgc = `    liquid_assets: 'नकद पीसे',
    physical_assets: 'जमीन-जायदाद',
    liabilities: 'कर्जा',
    assets_and_liabilities: 'जायदाद और कर्जा',
    add_asset_liability: 'जायदाद / कर्जा जोड़ें',
    net_worth: 'कुल पीसा',
    total_assets: 'कुल जायदाद',
    total_liabilities: 'कुल कर्जा',
    no_wealth_items: 'इब तक कोए जायदाद कोन्या।',
    add_wealth_items_desc: 'अपणे बैंक खाते, प्लॉट या कर्जे लिख लें ताकि थारा कुल पीसा कढ़ ज्या।',
    add_wealth_item: 'जायदाद जोड़ें',
    delete_item: 'काटना सै?',
    are_you_sure_delete_item: 'के तनै पक्का यो काटना सै',
    affect_net_worth: 'इसतै थारे कुल पीसे के हिसाब म फर्क पड़ेगा।',
`;

content = content.replace("wealth: 'Wealth Management',", "wealth: 'Wealth Management',\n" + newEn);
content = content.replace("wealth: 'धन प्रबंधन',", "wealth: 'धन प्रबंधन',\n" + newHi);
content = content.replace("wealth: 'संपत्ती व्यवस्थापन',", "wealth: 'संपत्ती व्यवस्थापन',\n" + newMr);
content = content.replace("wealth: 'धन-दौलत',", "wealth: 'धन-दौलत',\n" + newBgc);

fs.writeFileSync('/Users/sarthakmathapati/Desktop/skens-code-git/Full_stack_project/9-BudgetTracker/frontend/src/services/i18n.js', content);
