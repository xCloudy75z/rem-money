var Seed = (function () {
  'use strict';

  var DEFAULT_CATEGORIES = [
    { name: 'Food',      icon: '🍔', color: '#e67e22', order: 0 },
    { name: 'Transport', icon: '🚗', color: '#3498db', order: 1 },
    { name: 'Bills',     icon: '🧾', color: '#9b59b6', order: 2 },
    { name: 'Fun',       icon: '🎉', color: '#e74c3c', order: 3 },
    { name: 'Other',     icon: '•',       color: '#7f8c8d', order: 4 }
  ];

  function defaultCategories(nowISO, idGen) {
    var map = {};
    DEFAULT_CATEGORIES.forEach(function (c, i) {
      var id = idGen('cat-' + i);
      map[id] = {
        id: id, name: c.name, icon: c.icon, color: c.color,
        order: c.order, isArchived: false, createdAt: nowISO,
        budget: 0, budgetPeriod: 'monthly'
      };
    });
    return map;
  }

  function newCycle(startDate, endDate, startBudget, nowISO, idGen) {
    var id = idGen('cycle');
    return {
      id: id, startDate: startDate, endDate: endDate, startBudget: startBudget,
      archivedAt: null, createdAt: nowISO
    };
  }

  return {
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    defaultCategories: defaultCategories,
    newCycle: newCycle
  };
})();
