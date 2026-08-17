const fs = require('fs');
let content = fs.readFileSync('/Users/sarthakmathapati/Desktop/skens-code-git/Full_stack_project/9-BudgetTracker/frontend/src/pages/Subscriptions.jsx', 'utf8');

content = content.replace(
  "const { fmt, subscriptions: subs, refetch, USER_ID } = useContext(AppContext);",
  "const { fmt, subscriptions: subs, refetch, USER_ID, t } = useContext(AppContext);"
);

content = content.replace("<h2>Active Subscriptions</h2>", "<h2>{t('active_subscriptions')}</h2>");
content = content.replace(/<span className="mh-badge">\{subs\.length\} active<\/span>/, '<span className="mh-badge">{subs.length} {t("active")}</span>');
content = content.replace(/<Plus size=\{16\} \/> Add New/, '<Plus size={16} /> {t("add_new")}');

content = content.replace(/label: 'Monthly Cost'/g, "label: t('monthly_cost')");
content = content.replace(/label: 'Annual Cost'/g, "label: t('annual_cost')");
content = content.replace(/label: 'Active Subs'/g, "label: t('active_subs')");

content = content.replace(/<p className="primary-msg">No subscriptions yet\.<\/p>/, '<p className="primary-msg">{t("no_subscriptions_yet")}</p>');
content = content.replace(/<p className="secondary-msg">Track your Netflix, Spotify, or gym memberships here\.<\/p>/, '<p className="secondary-msg">{t("track_subscriptions")}</p>');
content = content.replace(/<Plus size=\{16\} \/> Add First Subscription/, '<Plus size={16} /> {t("add_first_subscription")}');

content = content.replace(/<span className="mc-label">Cycle<\/span>/, '<span className="mc-label">{t("billing_cycle")}</span>');
content = content.replace(/<span className="mc-label">Cost<\/span>/, '<span className="mc-label">{t("cost")}</span>');

content = content.replace(/title="Add Subscription"/, 'title={t("add_subscription")}');
content = content.replace(/confirmText="Save Subscription"/, 'confirmText={t("save")}');

content = content.replace(/title="Delete Subscription\?"/, 'title={t("delete_subscription")}');
content = content.replace(/confirmText="Yes, Delete"/, 'confirmText={t("delete")}');
content = content.replace(/Are you sure you want to remove <strong>\{subToDelete?.name\}<\/strong>\?/, '{t("are_you_sure_delete_sub")} <strong>{subs.find(s => s.id === subToDelete)?.name}</strong>?');

fs.writeFileSync('/Users/sarthakmathapati/Desktop/skens-code-git/Full_stack_project/9-BudgetTracker/frontend/src/pages/Subscriptions.jsx', content);
