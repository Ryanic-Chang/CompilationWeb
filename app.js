// app.js - 页面导航与基础 UI 逻辑

document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');
    const pageSections = document.querySelectorAll('.page-section');

    // 页面导航切换逻辑
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('data-target');

            // 移除所有激活状态
            navItems.forEach(nav => nav.classList.remove('active', 'bg-indigo-50', 'text-indigo-700', 'font-medium'));
            navItems.forEach(nav => nav.classList.add('text-slate-600', 'hover:bg-slate-50', 'hover:text-indigo-600'));
            
            // 隐藏所有页面内容
            pageSections.forEach(section => section.classList.remove('active'));

            // 激活当前选项
            item.classList.remove('text-slate-600', 'hover:bg-slate-50', 'hover:text-indigo-600');
            item.classList.add('active', 'bg-indigo-50', 'text-indigo-700', 'font-medium');
            
            // 显示目标内容
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
            }
        });
    });
});
