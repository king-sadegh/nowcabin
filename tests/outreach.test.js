const assert = require('node:assert/strict');
const { evaluateAgentReply, renderCampaignTemplate } = require('../src/outreach/ruleEngine');
const { outreachManager } = require('../src/outreach/outreachManager');
const { db } = require('../src/db');

async function runTests() {
  console.log('=== Testing Outreach Bot & Persian Rule Engine ===');

  const sampleContact = {
    phone: '09125556677',
    full_name: 'مهندس کریمی',
    agency_name: 'املاک فرمانیه',
    district: 'شمال و شرق تهران',
  };

  // 1. Test Campaign Template Rendering
  const tpl = 'سلام {{name}} از {{agency}} در {{district}} - لینک: {{link}}';
  const rendered = renderCampaignTemplate(tpl, sampleContact);
  assert.ok(rendered.includes('مهندس کریمی'), 'Template should include contact name');
  assert.ok(rendered.includes('املاک فرمانیه'), 'Template should include agency name');
  assert.ok(rendered.includes('?ref=09125556677'), 'Template should include referral link');

  // 2. Test FAQ Commission Question (Auto-reply, non-serious)
  const commDecision = evaluateAgentReply('سلام وقت بخیر، پورسانت مشاور چند درصد هست؟', sampleContact);
  assert.equal(commDecision.category, 'faq_commission');
  assert.equal(commDecision.isSerious, false);
  assert.equal(commDecision.autoRegisterAgent, true);
  assert.ok(commDecision.replyText.includes('5٪') || commDecision.replyText.includes('۵٪'));

  // 3. Test FAQ Portfolio Question
  const portDecision = evaluateAgentReply('لطفا عکس نمونه کار قبل و بعد بفرستید', sampleContact);
  assert.equal(portDecision.category, 'faq_portfolio');
  assert.equal(portDecision.isSerious, false);
  assert.ok(portDecision.replyText.includes('/changes.html'));

  // 4. Test Serious Lead (Ready customer / file) -> escalates & pauses bot
  const seriousDecision = evaluateAgentReply('سلام، یه مشتری دارم در نیاوران میخواد کابینتش رو رنگ کنه، بازدید بیاید', sampleContact);
  assert.equal(seriousDecision.category, 'serious_lead');
  assert.equal(seriousDecision.isSerious, true);
  assert.equal(seriousDecision.autoRegisterAgent, true);
  assert.ok(seriousDecision.seriousReason.length > 0);

  // 5. Test Opt-out -> pauses bot & marks opted out
  const optOutDecision = evaluateAgentReply('لطفا پیام نده علاقه ندارم', sampleContact);
  assert.equal(optOutDecision.category, 'opt_out');
  assert.equal(optOutDecision.isOptOut, true);

  // 6. Test Bulk Import of 2000 Contacts in SQLite
  const lines = [];
  for (let i = 0; i < 2000; i++) {
    const num = String(1000000 + i).padStart(7, '0');
    lines.push(`0935${num}, مشاور تست ${i + 1}, املاک منطقه ${i % 10}, شمال و شرق تهران`);
  }
  const t0 = Date.now();
  const importRes = outreachManager.importContacts({
    rawText: lines.join('\n'),
    defaultDistrict: 'شمال و شرق تهران',
  });
  const elapsedMs = Date.now() - t0;
  console.log(`Imported 2000 contacts in ${elapsedMs}ms:`, importRes);
  assert.equal(importRes.totalProcessed, 2000);

  // 7. Test Inbound Message Handling & Serious Lead Escalation in DB
  const testPhone = '09351000005';
  await outreachManager.handleInboundMessage({
    channel: 'whatsapp',
    phone: testPhone,
    text: 'سلام، یه فایل دارم مشتری میخواد بازدید بیاید تماس بگیرید',
    pushName: 'مشاور ویژه نیاوران',
    externalId: `test_ext_${Date.now()}`,
  });

  const updatedRow = db.prepare('SELECT * FROM outreach_contacts WHERE phone = ?').get(testPhone);
  assert.equal(updatedRow.is_serious, 1, 'Contact should be marked serious');
  assert.equal(updatedRow.bot_paused, 1, 'Bot should be paused for serious contact');
  assert.equal(updatedRow.wa_status, 'registered', 'Serious contact should be auto-registered as agent');

  const agentUser = db.prepare('SELECT * FROM users WHERE phone = ?').get(testPhone);
  assert.ok(agentUser && agentUser.role === 'agent', 'Contact should exist in main users table as agent');

  // Cleanup test 09351* rows so production DB stays clean
  db.prepare(`DELETE FROM outreach_contacts WHERE phone LIKE '09351%'`).run();
  db.prepare(`DELETE FROM agent_applications WHERE phone LIKE '09351%'`).run();
  db.prepare(`DELETE FROM users WHERE phone LIKE '09351%'`).run();

  console.log('=== All Outreach Bot Tests Passed Successfully! ===');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
