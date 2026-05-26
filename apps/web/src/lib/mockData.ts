export const intents = [
  { id: 'trint_7Kq2Vm91', type: 'transfer_intent', status: 'Succeeded', amount: '$125,000.00', from: 'acct_treasury_001', to: 'acct_ops_442', updated: '2 min ago' },
  { id: 'issint_3Pz8Bc14', type: 'issue_intent', status: 'Processing', amount: '$80,000.00', from: 'issuer_usdc_001', to: 'acct_customer_118', updated: '6 min ago' },
  { id: 'trint_9Lm5Qd63', type: 'transfer_intent', status: 'RequiresAction', amount: '$14,250.00', from: 'acct_demo_001', to: 'acct_vendor_874', updated: '9 min ago' },
  { id: 'redint_4Vn1Xa77', type: 'redeem_intent', status: 'Failed', amount: '$7,400.00', from: 'acct_customer_662', to: 'issuer_usdc_001', updated: '18 min ago' },
  { id: 'trint_1Bc9Nd20', type: 'transfer_intent', status: 'Canceled', amount: '$930.00', from: 'acct_demo_001', to: 'acct_partner_012', updated: '28 min ago' },
  { id: 'trint_8Wd3Kp05', type: 'transfer_intent', status: 'Succeeded', amount: '$420,000.00', from: 'acct_fund_210', to: 'acct_custody_002', updated: '34 min ago' },
  { id: 'issint_6Mx2Rt88', type: 'issue_intent', status: 'Succeeded', amount: '$1,200,000.00', from: 'issuer_usdc_001', to: 'acct_liquidity_301', updated: '41 min ago' },
  { id: 'trint_2Hb4Ls31', type: 'transfer_intent', status: 'Processing', amount: '$55,700.00', from: 'acct_ops_442', to: 'acct_customer_881', updated: '51 min ago' },
  { id: 'redint_5Qf7Yz44', type: 'redeem_intent', status: 'Succeeded', amount: '$300,000.00', from: 'acct_customer_118', to: 'issuer_usdc_001', updated: '1 hr ago' },
  { id: 'trint_0Nt6Jw92', type: 'transfer_intent', status: 'Failed', amount: '$3,800.00', from: 'acct_demo_001', to: 'acct_vendor_991', updated: '1 hr ago' }
] as const;

export const webhookDeliveries = [
  { eventId: 'evt_2Lk98Vd', type: 'transfer_intent.succeeded', target: 'https://api.example.test/hooks/pillar', httpStatus: '200', deliveredAt: '2 min ago' },
  { eventId: 'evt_8Nh44Qr', type: 'issue_intent.processing', target: 'https://api.example.test/hooks/pillar', httpStatus: '200', deliveredAt: '6 min ago' },
  { eventId: 'evt_7Gb15Ts', type: 'transfer_intent.requires_action', target: 'https://api.example.test/hooks/pillar', httpStatus: '409 then 200', deliveredAt: '9 min ago' },
  { eventId: 'evt_4Va62Px', type: 'redeem_intent.failed', target: 'https://backup.example.test/hooks', httpStatus: 'dlq', deliveredAt: '18 min ago' },
  { eventId: 'evt_1Qr73Yk', type: 'operation.completed', target: 'https://api.example.test/hooks/pillar', httpStatus: '200', deliveredAt: '31 min ago' }
] as const;

export const operationTrace = [
  { step: 'received', detail: 'Request accepted with idempotency key', reference: 'req_2a8fVZp', time: '12:01:04' },
  { step: 'queued', detail: 'Operation queued for submission', reference: 'queue_9skT21', time: '12:01:05' },
  { step: 'submitted', detail: 'Command submitted to runtime', reference: 'cmd_74mPq2', time: '12:01:06' },
  { step: 'ledger_committed', detail: 'Ledger update accepted', reference: 'offset_000093a7 / upd_8hT42k', time: '12:01:09' },
  { step: 'projected', detail: 'Projection updated', reference: 'proj_5sA881', time: '12:01:10' },
  { step: 'completed', detail: 'Webhook event emitted', reference: 'evt_2Lk98Vd', time: '12:01:11' }
] as const;
