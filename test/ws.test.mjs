import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wsInit, wsNav, wsBack, wsForward, wsCloseTab, activeTab, winOpen, winNav, winDock, winToggle, snapFor, routeKey, MAX_TABS } from '../src/ui/ws.mjs';

test('tabs keep their own history and an open page is focused, not duplicated', () => {
  let ws = wsInit({ name: 'cash' });
  ws = wsNav(ws, { name: 'sales' });
  ws = wsNav(ws, { name: 'sales', id: 'c1' });
  assert.equal(routeKey(activeTab(ws).route), 'sales-c1');
  ws = wsBack(ws);
  assert.equal(activeTab(ws).route.name, 'sales');
  assert.equal(activeTab(ws).route.id, null);
  ws = wsForward(ws);
  assert.equal(activeTab(ws).route.id, 'c1');
  ws = wsNav(ws, { name: 'animals' }, { newTab: true });
  assert.equal(ws.tabs.length, 2);
  ws = wsNav(ws, { name: 'sales', id: 'c1' });
  assert.equal(ws.active, 't1');
  assert.equal(ws.tabs.length, 2);
  ws = wsCloseTab(ws, 't1');
  assert.equal(ws.tabs.length, 1);
  assert.equal(activeTab(ws).route.name, 'animals');
  for (let i = 0; i < 12; i++) ws = wsNav(ws, { name: 'sales', id: `c${i}` }, { newTab: true });
  assert.equal(ws.tabs.length, MAX_TABS);
});

test('windows open once per page, navigate on their own, dock back as a tab, and snap', () => {
  let ws = wsInit({ name: 'cash' });
  ws = winOpen(ws, { name: 'suppliers' });
  ws = winOpen(ws, { name: 'suppliers' });
  assert.equal(ws.windows.length, 1);
  const id = ws.windows[0].id;
  ws = winNav(ws, id, { name: 'suppliers', id: 's1' });
  assert.equal(ws.windows[0].route.id, 's1');
  assert.equal(activeTab(ws).route.name, 'cash');
  ws = winToggle(ws, id, 'min');
  assert.equal(ws.windows[0].state, 'min');
  ws = winToggle(ws, id, 'min');
  assert.equal(ws.windows[0].state, 'normal');
  ws = winDock(ws, id);
  assert.equal(ws.windows.length, 0);
  assert.equal(routeKey(activeTab(ws).route), 'suppliers-s1');
  assert.equal(snapFor(3, 300, { w: 1000, h: 700 }), 'snapL');
  assert.equal(snapFor(998, 300, { w: 1000, h: 700 }), 'snapR');
  assert.equal(snapFor(500, 2, { w: 1000, h: 700 }), 'max');
  assert.equal(snapFor(500, 300, { w: 1000, h: 700 }), null);
});
