const fs = require('fs');
let content = fs.readFileSync('/Users/sarthakmathapati/Desktop/skens-code-git/Full_stack_project/9-BudgetTracker/frontend/src/pages/Goals.jsx', 'utf8');

content = content.replace(
  "const { transactions, fmt, goals, refetch, USER_ID } = useContext(AppContext);",
  "const { transactions, fmt, goals, refetch, USER_ID, t } = useContext(AppContext);"
);

content = content.replace("<h2>Savings Goals</h2>", "<h2>{t('goals')}</h2>");
content = content.replace(/<span className="mh-badge">\{goals\.length\} active<\/span>/, '<span className="mh-badge">{goals.length} {t("active")}</span>');
content = content.replace(/<Plus size=\{16\} \/> New Goal/, '<Plus size={16} /> {t("new_goal")}');

content = content.replace(/label: 'Net Available'/g, "label: t('net_available')");
content = content.replace(/label: 'Target Amount'/g, "label: t('target_amount')");
content = content.replace(/label: 'Contributed'/g, "label: t('contributed')");

content = content.replace(/<p className="primary-msg">No goals yet\.<\/p>/, '<p className="primary-msg">{t("no_goals_yet")}</p>');
content = content.replace(/<p className="secondary-msg">Set your first savings target for a trip, a gadget, or an emergency fund\.<\/p>/, '<p className="secondary-msg">{t("set_first_savings_target")}</p>');
content = content.replace(/<Plus size=\{16\} \/> Create Goal/, '<Plus size={16} /> {t("create_goal")}');

content = content.replace(/🎉 Achieved!/, '🎉 {t("achieved")}');
content = content.replace(/<span className="mc-label">Saved<\/span>/, '<span className="mc-label">{t("saved")}</span>');
content = content.replace(/<Edit3 size=\{14\} \/> Update Progress/, '<Edit3 size={14} /> {t("update_progress")}');

content = content.replace(/placeholder="e\.g\., New Car, Vacation"/, 'placeholder={t("goal_name")}');
content = content.replace(/placeholder="e\.g\., 5000"/, 'placeholder={t("target_amount")}');
content = content.replace(/placeholder="e\.g\., 500 \(Optional\)"/, 'placeholder={t("already_saved")}');

content = content.replace(/title="Add New Goal"/, 'title={t("new_goal")}');
content = content.replace(/confirmText="Add Goal"/, 'confirmText={t("save_goal")}');

content = content.replace(/title="Delete Goal\?"/, 'title={t("delete_goal")}');
content = content.replace(/confirmText="Yes, Delete"/, 'confirmText={t("delete")}');
content = content.replace(/Are you sure you want to delete <strong>\{goalToDelete?.name\}<\/strong>\?/, '{t("are_you_sure_delete_goal")} <strong>{goals.find(g => g.id === goalToDelete)?.name}</strong>?');

content = content.replace(/title="Update Progress"/, 'title={t("update_progress")}');
content = content.replace(/confirmText="Save Progress"/, 'confirmText={t("save")}');
content = content.replace(/placeholder="Enter amount \(e\.g\., 100 or -50\)"/, 'placeholder={t("amount")}');

fs.writeFileSync('/Users/sarthakmathapati/Desktop/skens-code-git/Full_stack_project/9-BudgetTracker/frontend/src/pages/Goals.jsx', content);
