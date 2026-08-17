const fs = require('fs');
let content = fs.readFileSync('/Users/sarthakmathapati/Desktop/skens-code-git/Full_stack_project/9-BudgetTracker/frontend/src/pages/Wealth.jsx', 'utf8');

content = content.replace(
  "const CLASS_LABELS = {",
  "const getClassLabels = (t) => ({\n  liquid_asset: t('liquid_assets'),\n  illiquid_asset: t('physical_assets'),\n  liability: t('liabilities'),\n});"
);

content = content.replace(/CLASS_LABELS\[([a-zA-Z0-9_.]+)\]/g, "getClassLabels(t)[$1]");
content = content.replace(/Object.keys\(CLASS_LABELS\)/g, "Object.keys(getClassLabels(t))");
content = content.replace(/<h2>Wealth Management<\/h2>/, "<h2>{t('wealth')}</h2>");
content = content.replace(/<span className="mh-badge">\{wealthItems\.length\} Assets & Liabilities<\/span>/, '<span className="mh-badge">{wealthItems.length} {t("assets_and_liabilities")}</span>');
content = content.replace(/<Plus size=\{16\} \/> Add Asset \/ Liability/, '<Plus size={16} /> {t("add_asset_liability")}');
content = content.replace(/label: 'Net Worth'/g, "label: t('net_worth')");
content = content.replace(/label: 'Total Assets'/g, "label: t('total_assets')");
content = content.replace(/label: 'Total Liabilities'/g, "label: t('total_liabilities')");

content = content.replace(/<p className="primary-msg">No wealth items tracked\.<\/p>/, '<p className="primary-msg">{t("no_wealth_items")}</p>');
content = content.replace(/<p className="secondary-msg">Add your bank accounts, investments, or loans to calculate your net worth\.<\/p>/, '<p className="secondary-msg">{t("add_wealth_items_desc")}</p>');

content = content.replace(/title="Add Wealth Item"/, 'title={t("add_wealth_item")}');
content = content.replace(/title="Delete Item\?"/, 'title={t("delete_item")}');
content = content.replace(/confirmText="Yes, Delete"/, 'confirmText={t("delete")}');
content = content.replace(/Are you sure you want to remove <strong>\{itemToDelete\?.name\}<\/strong>\? This will affect your net worth calculations\./, '{t("are_you_sure_delete_item")} <strong>{itemToDelete?.name}</strong>? {t("affect_net_worth")}');

fs.writeFileSync('/Users/sarthakmathapati/Desktop/skens-code-git/Full_stack_project/9-BudgetTracker/frontend/src/pages/Wealth.jsx', content);
