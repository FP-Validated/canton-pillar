export type IntentStatus = 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'expired';
export type OperationStatus = 'received' | 'queued' | 'submitted' | 'in_flight' | 'ledger_committed' | 'projected' | 'failed' | 'unknown' | 'reconciled';
export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying' | 'dead_lettered' | 'manually_replayed';
export type AccountStatus = 'active' | 'restricted' | 'suspended' | 'closed';
export type AssetStatus = 'draft' | 'active' | 'paused' | 'retired';
export type HoldingStatus = 'active' | 'partially_reserved' | 'reserved' | 'frozen' | 'redeeming' | 'closed';
export type HoldStatus = 'requires_action' | 'active' | 'released' | 'expired' | 'failed';
export type WebhookEndpointStatus = 'enabled' | 'disabled';
export type ApiKeyStatus = 'active' | 'expired' | 'revoked';

export interface Account { id: string; object: 'account'; display_name: string; status: AccountStatus; livemode: boolean; created: string; metadata: Record<string, string>; }
export interface Asset { id: string; object: 'asset'; code: string; display_name: string; status: AssetStatus; decimals: number; issuer_account_id: string; created: string; restrictions: string[]; metadata: Record<string, string>; }
export interface Balance { id: string; object: 'balance'; account_id: string; asset_id: string; available: string; reserved: string; total: string; updated: string; }
export interface Holding { id: string; object: 'holding'; account_id: string; asset_id: string; balance_id: string; quantity: string; reserved_quantity: string; status: HoldingStatus; created: string; updated: string; metadata: Record<string, string>; }
export interface Hold { id: string; object: 'hold'; holding_id: string; account_id: string; asset_id: string; amount: string; status: HoldStatus; reason: string; expires_at: string; created: string; operation_id: string; metadata: Record<string, string>; }
export interface IssueIntent { id: string; object: 'issue_intent'; asset_id: string; account_id: string; amount: string; status: IntentStatus; operation_id: string; created: string; updated: string; metadata: Record<string, string>; }
export interface RedeemIntent { id: string; object: 'redeem_intent'; holding_id: string; account_id: string; asset_id: string; amount: string; status: IntentStatus; operation_id: string; created: string; updated: string; metadata: Record<string, string>; }
export interface TransferIntent { id: string; object: 'transfer_intent'; from_account_id: string; to_account_id: string; asset_id: string; amount: string; status: IntentStatus; operation_id: string; created: string; updated: string; metadata: Record<string, string>; }
export interface Operation { id: string; object: 'operation'; status: OperationStatus; intent_id?: string; resource_id: string; resource_type: string; received_at: string; updated: string; latency_ms: number; ledger: { update_reference: string; effective_at: string; }; transitions: { status: OperationStatus; at: string; note: string }[]; }
export interface Event { id: string; object: 'event'; type: string; resource_id: string; resource_type: string; created: string; data: Record<string, string>; }
export interface WebhookEndpoint { id: string; object: 'webhook_endpoint'; url: string; description: string; status: WebhookEndpointStatus; enabled_events: string[]; secret_last4: string; created: string; }
export interface WebhookDelivery { id: string; object: 'webhook_delivery'; endpoint_id: string; event_id: string; status: WebhookDeliveryStatus; http_status: number; attempt_count: number; next_retry_at?: string; delivered_at?: string; created: string; target: string; type: string; }
export interface ApiKey { id: string; object: 'api_key'; name: string; prefix: 'secret_test' | 'secret_live' | 'restricted_test' | 'publishable_test' | 'restricted_live'; last4: string; status: ApiKeyStatus; scopes: string[]; created: string; expires_at?: string; }
export interface ApiRequestLogEntry { id: string; object: 'api_request'; method: string; path: string; status_code: number; request_id: string; api_key: string; latency_ms: number; created: string; }

export const accounts: Account[] = [
  { id: 'acct_01HY8P6Z4J5N3T2R1Q0P9M8L7K', object: 'account', display_name: 'Treasury omnibus', status: 'active', livemode: false, created: '2026-05-20T08:00:00.000Z', metadata: { tier: 'institutional' } },
  { id: 'acct_01HY8P7A5K6P4V3S2R1Q0N9M8L', object: 'account', display_name: 'Brokerage settlement', status: 'active', livemode: false, created: '2026-05-20T08:05:00.000Z', metadata: { region: 'us' } },
  { id: 'acct_01HY8P8B6L7Q5W4T3S2R1P0N9M', object: 'account', display_name: 'Client cash pool', status: 'restricted', livemode: false, created: '2026-05-20T08:10:00.000Z', metadata: { review: 'enhanced' } },
  { id: 'acct_01HY8P9C7M8R6X5V4T3S2Q1P0N', object: 'account', display_name: 'APAC distribution', status: 'active', livemode: false, created: '2026-05-20T08:15:00.000Z', metadata: { region: 'apac' } },
  { id: 'acct_01HY8PAD8N9S7Y6W5V4T3R2Q1P', object: 'account', display_name: 'Suspense review', status: 'suspended', livemode: false, created: '2026-05-20T08:20:00.000Z', metadata: { reason: 'review' } },
  { id: 'acct_01HY8PBE9P0T8Z7X6W5V4S3R2Q', object: 'account', display_name: 'Closed pilot wallet', status: 'closed', livemode: false, created: '2026-05-20T08:25:00.000Z', metadata: { phase: 'pilot' } }
];

export const assets: Asset[] = [
  { id: 'asst_01HY8PCF0Q1V9A8Y7X6W5T4S3R', object: 'asset', code: 'USDC', display_name: 'USD Coin', status: 'active', decimals: 2, issuer_account_id: accounts[0].id, created: '2026-05-20T09:00:00.000Z', restrictions: ['allowlist_required'], metadata: { network: 'canton' } },
  { id: 'asst_01HY8PDG1R2W0B9Z8Y7X6V5T4S', object: 'asset', code: 'USDT', display_name: 'Tether USD', status: 'active', decimals: 2, issuer_account_id: accounts[0].id, created: '2026-05-20T09:05:00.000Z', restrictions: ['daily_limit'], metadata: { network: 'canton' } },
  { id: 'asst_01HY8PEH2S3X1C0A9Z8Y7W6V5T', object: 'asset', code: 'EUR-CBDC', display_name: 'Euro CBDC', status: 'draft', decimals: 2, issuer_account_id: accounts[3].id, created: '2026-05-20T09:10:00.000Z', restrictions: ['pilot_only'], metadata: { jurisdiction: 'eu' } },
  { id: 'asst_01HY8PFJ3T4Y2D1B0A9Z8X7W6V', object: 'asset', code: 'JPY-Pillar', display_name: 'JPY Pillar Deposit', status: 'paused', decimals: 0, issuer_account_id: accounts[3].id, created: '2026-05-20T09:15:00.000Z', restrictions: ['business_hours'], metadata: { jurisdiction: 'jp' } },
  { id: 'asst_01HY8PGK4V5Z3E2C1B0A9Y8X7W', object: 'asset', code: 'MSFT-Equity', display_name: 'Microsoft Equity', status: 'retired', decimals: 4, issuer_account_id: accounts[1].id, created: '2026-05-20T09:20:00.000Z', restrictions: ['qualified_investor'], metadata: { cusip: '594918104' } }
];

export const balances: Balance[] = [
  { id: 'bal_01HY8PHL5W6A4F3D2C1B0Z9Y8X', object: 'balance', account_id: accounts[0].id, asset_id: assets[0].id, available: '1250000.00', reserved: '50000.00', total: '1300000.00', updated: '2026-05-26T08:10:00.000Z' },
  { id: 'bal_01HY8PJM6X7B5G4E3D2C1A0Z9Y', object: 'balance', account_id: accounts[1].id, asset_id: assets[0].id, available: '840250.00', reserved: '12000.00', total: '852250.00', updated: '2026-05-26T08:11:00.000Z' },
  { id: 'bal_01HY8PKN7Y8C6H5F4E3D2B1A0Z', object: 'balance', account_id: accounts[2].id, asset_id: assets[1].id, available: '420000.00', reserved: '80000.00', total: '500000.00', updated: '2026-05-26T08:12:00.000Z' },
  { id: 'bal_01HY8PLP8Z9D7J6G5F4E3C2B1A', object: 'balance', account_id: accounts[3].id, asset_id: assets[2].id, available: '250000.00', reserved: '0.00', total: '250000.00', updated: '2026-05-26T08:13:00.000Z' },
  { id: 'bal_01HY8PMQ9A0E8K7H6G5F4D3C2B', object: 'balance', account_id: accounts[4].id, asset_id: assets[0].id, available: '0.00', reserved: '15000.00', total: '15000.00', updated: '2026-05-26T08:14:00.000Z' },
  { id: 'bal_01HY8PNR0B1F9L8J7H6G5E4D3C', object: 'balance', account_id: accounts[1].id, asset_id: assets[4].id, available: '1850.5000', reserved: '10.0000', total: '1860.5000', updated: '2026-05-26T08:15:00.000Z' },
  { id: 'bal_01HY8PPS1C2G0M9K8J7H6F5E4D', object: 'balance', account_id: accounts[3].id, asset_id: assets[3].id, available: '9000000', reserved: '250000', total: '9250000', updated: '2026-05-26T08:16:00.000Z' },
  { id: 'bal_01HY8PQT2D3H1N0L9K8J7G6F5E', object: 'balance', account_id: accounts[5].id, asset_id: assets[1].id, available: '0.00', reserved: '0.00', total: '0.00', updated: '2026-05-26T08:17:00.000Z' }
];

export const holdings: Holding[] = [
  { id: 'hldg_01HY8PRV3E4J2P1M0L9K8H7G6F', object: 'holding', account_id: accounts[0].id, asset_id: assets[0].id, balance_id: balances[0].id, quantity: '500000.00', reserved_quantity: '0.00', status: 'active', created: '2026-05-24T10:00:00.000Z', updated: '2026-05-26T08:00:00.000Z', metadata: { lot: 'primary' } },
  { id: 'hldg_01HY8PSW4F5K3Q2N1M0L9J8H7G', object: 'holding', account_id: accounts[0].id, asset_id: assets[0].id, balance_id: balances[0].id, quantity: '250000.00', reserved_quantity: '50000.00', status: 'partially_reserved', created: '2026-05-24T10:05:00.000Z', updated: '2026-05-26T08:01:00.000Z', metadata: { lot: 'reserve' } },
  { id: 'hldg_01HY8PTX5G6L4R3P2N1M0K9J8H', object: 'holding', account_id: accounts[1].id, asset_id: assets[0].id, balance_id: balances[1].id, quantity: '12000.00', reserved_quantity: '12000.00', status: 'reserved', created: '2026-05-24T10:10:00.000Z', updated: '2026-05-26T08:02:00.000Z', metadata: { lot: 'client' } },
  { id: 'hldg_01HY8PVY6H7M5S4Q3P2N1L0K9J', object: 'holding', account_id: accounts[2].id, asset_id: assets[1].id, balance_id: balances[2].id, quantity: '80000.00', reserved_quantity: '0.00', status: 'frozen', created: '2026-05-24T10:15:00.000Z', updated: '2026-05-26T08:03:00.000Z', metadata: { review: 'case_42' } },
  { id: 'hldg_01HY8PWZ7J8N6T5R4Q3P2M1L0K', object: 'holding', account_id: accounts[3].id, asset_id: assets[2].id, balance_id: balances[3].id, quantity: '100000.00', reserved_quantity: '0.00', status: 'redeeming', created: '2026-05-24T10:20:00.000Z', updated: '2026-05-26T08:04:00.000Z', metadata: { channel: 'pilot' } },
  { id: 'hldg_01HY8PX08K9P7V6S5R4Q3N2M1L', object: 'holding', account_id: accounts[1].id, asset_id: assets[4].id, balance_id: balances[5].id, quantity: '1850.5000', reserved_quantity: '10.0000', status: 'partially_reserved', created: '2026-05-24T10:25:00.000Z', updated: '2026-05-26T08:05:00.000Z', metadata: { security: 'MSFT' } },
  { id: 'hldg_01HY8PY19L0Q8W7T6S5R4P3N2M', object: 'holding', account_id: accounts[3].id, asset_id: assets[3].id, balance_id: balances[6].id, quantity: '9000000', reserved_quantity: '250000', status: 'reserved', created: '2026-05-24T10:30:00.000Z', updated: '2026-05-26T08:06:00.000Z', metadata: { market: 'tokyo' } },
  { id: 'hldg_01HY8PZ2AM1R9X8V7T6S5Q4P3N', object: 'holding', account_id: accounts[4].id, asset_id: assets[0].id, balance_id: balances[4].id, quantity: '15000.00', reserved_quantity: '15000.00', status: 'frozen', created: '2026-05-24T10:35:00.000Z', updated: '2026-05-26T08:07:00.000Z', metadata: { review: 'suspense' } },
  { id: 'hldg_01HY8Q03BN2S0Y9W8V7T6R5Q4P', object: 'holding', account_id: accounts[2].id, asset_id: assets[1].id, balance_id: balances[2].id, quantity: '320000.00', reserved_quantity: '0.00', status: 'active', created: '2026-05-24T10:40:00.000Z', updated: '2026-05-26T08:08:00.000Z', metadata: { lot: 'operating' } },
  { id: 'hldg_01HY8Q14CP3T1Z0X9W8V7S6R5Q', object: 'holding', account_id: accounts[5].id, asset_id: assets[1].id, balance_id: balances[7].id, quantity: '0.00', reserved_quantity: '0.00', status: 'closed', created: '2026-05-24T10:45:00.000Z', updated: '2026-05-26T08:09:00.000Z', metadata: { phase: 'retired' } }
];

export const holds: Hold[] = [
  { id: 'hold_01HY8Q25DQ4V2A1Y0X9W8T7S6R', object: 'hold', holding_id: holdings[1].id, account_id: accounts[0].id, asset_id: assets[0].id, amount: '50000.00', status: 'active', reason: 'settlement reserve', expires_at: '2026-05-27T08:00:00.000Z', created: '2026-05-26T07:00:00.000Z', operation_id: 'op_01HY8R7K0A9S8D7F6G5H4J3K2L', metadata: { desk: 'treasury' } },
  { id: 'hold_01HY8Q36ER5W3B2Z1Y0X9V8T7S', object: 'hold', holding_id: holdings[2].id, account_id: accounts[1].id, asset_id: assets[0].id, amount: '12000.00', status: 'requires_action', reason: 'approval required', expires_at: '2026-05-27T09:00:00.000Z', created: '2026-05-26T07:05:00.000Z', operation_id: 'op_01HY8R8L1B0T9E8G7H6J5K4L3M', metadata: { approver: 'ops' } },
  { id: 'hold_01HY8Q47FS6X4C3A2Z1Y0W9V8T', object: 'hold', holding_id: holdings[6].id, account_id: accounts[3].id, asset_id: assets[3].id, amount: '250000', status: 'released', reason: 'trade matched', expires_at: '2026-05-26T12:00:00.000Z', created: '2026-05-26T07:10:00.000Z', operation_id: 'op_01HY8R9M2C1V0F9H8J7K6L5M4N', metadata: { venue: 'tokyo' } },
  { id: 'hold_01HY8Q58GT7Y5D4B3A2Z1X0W9V', object: 'hold', holding_id: holdings[7].id, account_id: accounts[4].id, asset_id: assets[0].id, amount: '15000.00', status: 'expired', reason: 'timeout', expires_at: '2026-05-26T07:30:00.000Z', created: '2026-05-26T06:30:00.000Z', operation_id: 'op_01HY8RAM3D2W1G0J9K8L7M6N5P', metadata: { review: 'suspense' } },
  { id: 'hold_01HY8Q69HV8Z6E5C4B3A2Y1X0W', object: 'hold', holding_id: holdings[3].id, account_id: accounts[2].id, asset_id: assets[1].id, amount: '80000.00', status: 'failed', reason: 'account restricted', expires_at: '2026-05-27T10:00:00.000Z', created: '2026-05-26T07:15:00.000Z', operation_id: 'op_01HY8RBN4E3X2H1K0L9M8N7P6Q', metadata: { reason_code: 'risk' } },
  { id: 'hold_01HY8Q7AJW9A7F6D5C4B3Z2Y1X', object: 'hold', holding_id: holdings[5].id, account_id: accounts[1].id, asset_id: assets[4].id, amount: '10.0000', status: 'active', reason: 'corporate action', expires_at: '2026-05-28T08:00:00.000Z', created: '2026-05-26T07:20:00.000Z', operation_id: 'op_01HY8RCN5F4Y3J2L1M0N9P8Q7R', metadata: { security: 'MSFT' } },
  { id: 'hold_01HY8Q8BKX0B8G7E6D5C4A3Z2Y', object: 'hold', holding_id: holdings[0].id, account_id: accounts[0].id, asset_id: assets[0].id, amount: '25000.00', status: 'released', reason: 'manual release', expires_at: '2026-05-27T11:00:00.000Z', created: '2026-05-26T07:25:00.000Z', operation_id: 'op_01HY8RDP6G5Z4K3M2N1P0Q9R8S', metadata: { operator: 'ops' } },
  { id: 'hold_01HY8Q9CLY1C9H8F7E6D5B4A3Z', object: 'hold', holding_id: holdings[8].id, account_id: accounts[2].id, asset_id: assets[1].id, amount: '10000.00', status: 'requires_action', reason: 'dual control', expires_at: '2026-05-27T12:00:00.000Z', created: '2026-05-26T07:30:00.000Z', operation_id: 'op_01HY8REQ7H6A5L4N3P2Q1R0S9T', metadata: { approver: 'risk' } }
];

export const issueIntents: IssueIntent[] = [
  { id: 'issint_01HY8QADMZ2D0J9G8F7E6C5B4A', object: 'issue_intent', asset_id: assets[0].id, account_id: accounts[0].id, amount: '100000.00', status: 'succeeded', operation_id: 'op_01HY8R0D4V3B2N1M0K9J8H7G6F', created: '2026-05-26T07:40:00.000Z', updated: '2026-05-26T07:41:00.000Z', metadata: { source: 'mint_window' } },
  { id: 'issint_01HY8QBENA3E1K0H9G8F7D6C5B', object: 'issue_intent', asset_id: assets[1].id, account_id: accounts[2].id, amount: '75000.00', status: 'processing', operation_id: 'op_01HY8R1E5W4C3P2N1M0K9J8H7G', created: '2026-05-26T07:42:00.000Z', updated: '2026-05-26T07:43:00.000Z', metadata: { batch: 'b1' } },
  { id: 'issint_01HY8QCFPB4F2L1J0H9G8E7D6C', object: 'issue_intent', asset_id: assets[2].id, account_id: accounts[3].id, amount: '50000.00', status: 'requires_action', operation_id: 'op_01HY8R2F6X5D4Q3P2N1M0K9J8H', created: '2026-05-26T07:44:00.000Z', updated: '2026-05-26T07:45:00.000Z', metadata: { approval: 'issuer' } },
  { id: 'issint_01HY8QDGQC5G3M2K1J0H9F8E7D', object: 'issue_intent', asset_id: assets[3].id, account_id: accounts[3].id, amount: '1000000', status: 'failed', operation_id: 'op_01HY8R3G7Y6E5R4Q3P2N1M0K9J', created: '2026-05-26T07:46:00.000Z', updated: '2026-05-26T07:47:00.000Z', metadata: { reason: 'paused_asset' } },
  { id: 'issint_01HY8QEHRD6H4N3L2K1J0G9F8E', object: 'issue_intent', asset_id: assets[0].id, account_id: accounts[1].id, amount: '25000.00', status: 'canceled', operation_id: 'op_01HY8R4H8Z7F6S5R4Q3P2N1M0K', created: '2026-05-26T07:48:00.000Z', updated: '2026-05-26T07:49:00.000Z', metadata: { canceled_by: 'client' } },
  { id: 'issint_01HY8QFJSE7J5P4M3L2K1H0G9F', object: 'issue_intent', asset_id: assets[4].id, account_id: accounts[1].id, amount: '25.0000', status: 'expired', operation_id: 'op_01HY8R5J9A8G7T6S5R4Q3P2N1M', created: '2026-05-26T07:50:00.000Z', updated: '2026-05-26T07:51:00.000Z', metadata: { expires_reason: 'window_closed' } }
];

export const redeemIntents: RedeemIntent[] = [
  { id: 'redint_01HY8QGKTF8K6Q5N4M3L2J1H0G', object: 'redeem_intent', holding_id: holdings[4].id, account_id: accounts[3].id, asset_id: assets[2].id, amount: '100000.00', status: 'succeeded', operation_id: 'op_01HY8R6K0A9H8V7T6S5R4Q3P2N', created: '2026-05-26T07:52:00.000Z', updated: '2026-05-26T07:53:00.000Z', metadata: { rail: 'sepa' } },
  { id: 'redint_01HY8QHLVG9L7R6P5N4M3K2J1H', object: 'redeem_intent', holding_id: holdings[0].id, account_id: accounts[0].id, asset_id: assets[0].id, amount: '30000.00', status: 'processing', operation_id: 'op_01HY8R7K0A9S8D7F6G5H4J3K2L', created: '2026-05-26T07:54:00.000Z', updated: '2026-05-26T07:55:00.000Z', metadata: { rail: 'ach' } },
  { id: 'redint_01HY8QJMWHA8S7Q6P5N4L3K2J', object: 'redeem_intent', holding_id: holdings[2].id, account_id: accounts[1].id, asset_id: assets[0].id, amount: '12000.00', status: 'requires_action', operation_id: 'op_01HY8R8L1B0T9E8G7H6J5K4L3M', created: '2026-05-26T07:56:00.000Z', updated: '2026-05-26T07:57:00.000Z', metadata: { approval: 'dual_control' } },
  { id: 'redint_01HY8QKNXJB9T8R7Q6P5M4L3K', object: 'redeem_intent', holding_id: holdings[3].id, account_id: accounts[2].id, asset_id: assets[1].id, amount: '80000.00', status: 'failed', operation_id: 'op_01HY8R9M2C1V0F9H8J7K6L5M4N', created: '2026-05-26T07:58:00.000Z', updated: '2026-05-26T07:59:00.000Z', metadata: { reason: 'frozen_holding' } },
  { id: 'redint_01HY8QLPYKC0V9S8R7Q6N5M4L', object: 'redeem_intent', holding_id: holdings[5].id, account_id: accounts[1].id, asset_id: assets[4].id, amount: '10.0000', status: 'canceled', operation_id: 'op_01HY8RAM3D2W1G0J9K8L7M6N5P', created: '2026-05-26T08:00:00.000Z', updated: '2026-05-26T08:01:00.000Z', metadata: { canceled_by: 'desk' } },
  { id: 'redint_01HY8QMqZLD1W0T9S8R7P6N5M', object: 'redeem_intent', holding_id: holdings[6].id, account_id: accounts[3].id, asset_id: assets[3].id, amount: '250000', status: 'expired', operation_id: 'op_01HY8RBN4E3X2H1K0L9M8N7P6Q', created: '2026-05-26T08:02:00.000Z', updated: '2026-05-26T08:03:00.000Z', metadata: { expires_reason: 'market_closed' } }
];

export const transferIntents: TransferIntent[] = [
  { id: 'trint_01HY8QNR0ME2X1V0T9S8Q7P6N', object: 'transfer_intent', from_account_id: accounts[0].id, to_account_id: accounts[1].id, asset_id: assets[0].id, amount: '45000.00', status: 'succeeded', operation_id: 'op_01HY8RCN5F4Y3J2L1M0N9P8Q7R', created: '2026-05-26T08:04:00.000Z', updated: '2026-05-26T08:05:00.000Z', metadata: { purpose: 'settlement' } },
  { id: 'trint_01HY8QPS1NF3Y2W1V0T9R8Q7P', object: 'transfer_intent', from_account_id: accounts[1].id, to_account_id: accounts[2].id, asset_id: assets[0].id, amount: '12000.00', status: 'processing', operation_id: 'op_01HY8RDP6G5Z4K3M2N1P0Q9R8S', created: '2026-05-26T08:06:00.000Z', updated: '2026-05-26T08:07:00.000Z', metadata: { purpose: 'client_move' } },
  { id: 'trint_01HY8QQT2PG4Z3X2W1V0S9R8Q', object: 'transfer_intent', from_account_id: accounts[2].id, to_account_id: accounts[0].id, asset_id: assets[1].id, amount: '80000.00', status: 'failed', operation_id: 'op_01HY8REQ7H6A5L4N3P2Q1R0S9T', created: '2026-05-26T08:08:00.000Z', updated: '2026-05-26T08:09:00.000Z', metadata: { reason: 'restricted_account' } },
  { id: 'trint_01HY8QRV3QH5A4Y3X2W1T0S9R', object: 'transfer_intent', from_account_id: accounts[3].id, to_account_id: accounts[1].id, asset_id: assets[3].id, amount: '250000', status: 'requires_action', operation_id: 'op_01HY8RFQ8J7B6M5P4Q3R2S1T0V', created: '2026-05-26T08:10:00.000Z', updated: '2026-05-26T08:11:00.000Z', metadata: { purpose: 'fx' } },
  { id: 'trint_01HY8QSW4RJ6B5Z4Y3X2V1T0S', object: 'transfer_intent', from_account_id: accounts[0].id, to_account_id: accounts[3].id, asset_id: assets[0].id, amount: '70000.00', status: 'succeeded', operation_id: 'op_01HY8RGR9K8C7N6Q5R4S3T2V1W', created: '2026-05-26T08:12:00.000Z', updated: '2026-05-26T08:13:00.000Z', metadata: { purpose: 'liquidity' } },
  { id: 'trint_01HY8QTX5SK7C6A5Z4Y3W2V1T', object: 'transfer_intent', from_account_id: accounts[1].id, to_account_id: accounts[0].id, asset_id: assets[4].id, amount: '10.0000', status: 'canceled', operation_id: 'op_01HY8RHS0L9D8P7R6S5T4V3W2X', created: '2026-05-26T08:14:00.000Z', updated: '2026-05-26T08:15:00.000Z', metadata: { canceled_by: 'desk' } },
  { id: 'trint_01HY8QVY6TL8D7B6A5Z4X3W2V', object: 'transfer_intent', from_account_id: accounts[4].id, to_account_id: accounts[0].id, asset_id: assets[0].id, amount: '15000.00', status: 'expired', operation_id: 'op_01HY8RJT1M0E9Q8S7T6V5W4X3Y', created: '2026-05-26T08:16:00.000Z', updated: '2026-05-26T08:17:00.000Z', metadata: { expires_reason: 'approval_timeout' } },
  { id: 'trint_01HY8QWZ7VM9E8C7B6A5Y4X3W', object: 'transfer_intent', from_account_id: accounts[3].id, to_account_id: accounts[2].id, asset_id: assets[2].id, amount: '50000.00', status: 'processing', operation_id: 'op_01HY8RKV2N1F0R9T8V7W6X5Y4Z', created: '2026-05-26T08:18:00.000Z', updated: '2026-05-26T08:19:00.000Z', metadata: { purpose: 'pilot' } },
  { id: 'trint_01HY8QX08WN0F9D8C7B6Z5Y4X', object: 'transfer_intent', from_account_id: accounts[2].id, to_account_id: accounts[3].id, asset_id: assets[1].id, amount: '25000.00', status: 'succeeded', operation_id: 'op_01HY8RLW3P2G1S0V9W8X7Y6Z5A', created: '2026-05-26T08:20:00.000Z', updated: '2026-05-26T08:21:00.000Z', metadata: { purpose: 'rebalance' } },
  { id: 'trint_01HY8QY19XP1G0E9D8C7A6Z5Y', object: 'transfer_intent', from_account_id: accounts[0].id, to_account_id: accounts[1].id, asset_id: assets[0].id, amount: '100000.00', status: 'succeeded', operation_id: 'op_01HY8RMX4Q3H2T1W0X9Y8Z7A6B', created: '2026-05-26T08:22:00.000Z', updated: '2026-05-26T08:23:00.000Z', metadata: { purpose: 'settlement' } }
];

export const intents = transferIntents;

const operationSeeds = [
  ['op_01HY8R0D4V3B2N1M0K9J8H7G6F', 'ledger_committed', issueIntents[0].id, 'issue_intent', issueIntents[0].id, 640],
  ['op_01HY8R1E5W4C3P2N1M0K9J8H7G', 'queued', issueIntents[1].id, 'issue_intent', issueIntents[1].id, 120],
  ['op_01HY8R2F6X5D4Q3P2N1M0K9J8H', 'received', issueIntents[2].id, 'issue_intent', issueIntents[2].id, 80],
  ['op_01HY8R3G7Y6E5R4Q3P2N1M0K9J', 'failed', issueIntents[3].id, 'issue_intent', issueIntents[3].id, 910],
  ['op_01HY8R4H8Z7F6S5R4Q3P2N1M0K', 'unknown', issueIntents[4].id, 'issue_intent', issueIntents[4].id, 300],
  ['op_01HY8R5J9A8G7T6S5R4Q3P2N1M', 'reconciled', issueIntents[5].id, 'issue_intent', issueIntents[5].id, 1550],
  ['op_01HY8R6K0A9H8V7T6S5R4Q3P2N', 'projected', redeemIntents[0].id, 'redeem_intent', redeemIntents[0].id, 720],
  ['op_01HY8R7K0A9S8D7F6G5H4J3K2L', 'submitted', redeemIntents[1].id, 'redeem_intent', redeemIntents[1].id, 250],
  ['op_01HY8R8L1B0T9E8G7H6J5K4L3M', 'in_flight', redeemIntents[2].id, 'redeem_intent', redeemIntents[2].id, 470],
  ['op_01HY8R9M2C1V0F9H8J7K6L5M4N', 'ledger_committed', transferIntents[0].id, 'transfer_intent', transferIntents[0].id, 690],
  ['op_01HY8RAM3D2W1G0J9K8L7M6N5P', 'projected', transferIntents[4].id, 'transfer_intent', transferIntents[4].id, 820],
  ['op_01HY8RBN4E3X2H1K0L9M8N7P6Q', 'failed', transferIntents[2].id, 'transfer_intent', transferIntents[2].id, 980],
  ['op_01HY8RCN5F4Y3J2L1M0N9P8Q7R', 'reconciled', holds[5].id, 'hold', holds[5].id, 1300]
] as const;

export const operations: Operation[] = operationSeeds.map(([id, status, intent_id, resource_type, resource_id, latency_ms], index) => ({
  id,
  object: 'operation',
  status,
  intent_id: String(intent_id).startsWith('hold_') ? undefined : intent_id,
  resource_id,
  resource_type,
  received_at: `2026-05-26T08:${String(10 + index).padStart(2, '0')}:00.000Z`,
  updated: `2026-05-26T08:${String(10 + index).padStart(2, '0')}:30.000Z`,
  latency_ms,
  ledger: { update_reference: `upd_${String(index + 1).padStart(4, '0')}`, effective_at: `2026-05-26T08:${String(10 + index).padStart(2, '0')}:20.000Z` },
  transitions: [
    { status: 'received', at: `2026-05-26T08:${String(10 + index).padStart(2, '0')}:00.000Z`, note: 'Accepted by Canton Pillar' },
    { status: status === 'received' ? 'received' : 'queued', at: `2026-05-26T08:${String(10 + index).padStart(2, '0')}:05.000Z`, note: 'Queued for processing' },
    { status, at: `2026-05-26T08:${String(10 + index).padStart(2, '0')}:30.000Z`, note: 'Latest operation state' }
  ]
}));

export const events: Event[] = [
  { id: 'evt_01HY8S0P5R4J3H2G1F0E9D8C7B', object: 'event', type: 'transfer_intent.succeeded', resource_id: transferIntents[0].id, resource_type: 'transfer_intent', created: '2026-05-26T08:05:30.000Z', data: { intent_id: transferIntents[0].id, amount: '45000.00' } },
  { id: 'evt_01HY8S1Q6S5K4J3H2G1F0E9D8C', object: 'event', type: 'transfer_intent.failed', resource_id: transferIntents[2].id, resource_type: 'transfer_intent', created: '2026-05-26T08:09:30.000Z', data: { intent_id: transferIntents[2].id, reason: 'restricted_account' } },
  { id: 'evt_01HY8S2R7T6L5K4J3H2G1F0E9D', object: 'event', type: 'issue_intent.processing', resource_id: issueIntents[1].id, resource_type: 'issue_intent', created: '2026-05-26T07:43:30.000Z', data: { intent_id: issueIntents[1].id, amount: '75000.00' } },
  { id: 'evt_01HY8S3S8V7M6L5K4J3H2G1F0E', object: 'event', type: 'redeem_intent.succeeded', resource_id: redeemIntents[0].id, resource_type: 'redeem_intent', created: '2026-05-26T07:53:30.000Z', data: { intent_id: redeemIntents[0].id, amount: '100000.00' } },
  { id: 'evt_01HY8S4T9W8N7M6L5K4J3H2G1F', object: 'event', type: 'holding.updated', resource_id: holdings[1].id, resource_type: 'holding', created: '2026-05-26T08:01:30.000Z', data: { holding_id: holdings[1].id, status: 'partially_reserved' } },
  { id: 'evt_01HY8S5V0X9P8N7M6L5K4J3H2G', object: 'event', type: 'hold.released', resource_id: holds[2].id, resource_type: 'hold', created: '2026-05-26T07:20:30.000Z', data: { hold_id: holds[2].id, amount: '250000' } },
  { id: 'evt_01HY8S6W1Y0Q9P8N7M6L5K4J3H', object: 'event', type: 'hold.expired', resource_id: holds[3].id, resource_type: 'hold', created: '2026-05-26T07:31:00.000Z', data: { hold_id: holds[3].id, amount: '15000.00' } },
  { id: 'evt_01HY8S7X2Z1R0Q9P8N7M6L5K4J', object: 'event', type: 'webhook_endpoint.created', resource_id: 'we_01HY8T0A3B2C1D0E9F8G7H6J5K', resource_type: 'webhook_endpoint', created: '2026-05-26T06:00:00.000Z', data: { endpoint_id: 'we_01HY8T0A3B2C1D0E9F8G7H6J5K' } },
  { id: 'evt_01HY8S8Y3A2S1R0Q9P8N7M6L5K', object: 'event', type: 'api_key.created', resource_id: 'ak_01HY8V0D6E5F4G3H2J1K0L9M8N', resource_type: 'api_key', created: '2026-05-26T06:10:00.000Z', data: { api_key_id: 'ak_01HY8V0D6E5F4G3H2J1K0L9M8N' } },
  { id: 'evt_01HY8S9Z4B3T2S1R0Q9P8N7M6L', object: 'event', type: 'operation.failed', resource_id: operations[3].id, resource_type: 'operation', created: '2026-05-26T08:13:31.000Z', data: { operation_id: operations[3].id } },
  { id: 'evt_01HY8SA05C4V3T2S1R0Q9P8N7M', object: 'event', type: 'operation.ledger_committed', resource_id: operations[0].id, resource_type: 'operation', created: '2026-05-26T08:10:31.000Z', data: { operation_id: operations[0].id } },
  { id: 'evt_01HY8SB16D5W4V3T2S1R0Q9P8N', object: 'event', type: 'event.replayed', resource_id: 'evt_01HY8S0P5R4J3H2G1F0E9D8C7B', resource_type: 'event', created: '2026-05-26T08:30:00.000Z', data: { event_id: 'evt_01HY8S0P5R4J3H2G1F0E9D8C7B' } }
];

export const webhookEndpoints: WebhookEndpoint[] = [
  { id: 'we_01HY8T0A3B2C1D0E9F8G7H6J5K', object: 'webhook_endpoint', url: 'https://example.com/pillar/webhooks/primary', description: 'Primary operations endpoint', status: 'enabled', enabled_events: ['transfer_intent.succeeded', 'operation.failed'], secret_last4: '7f3a', created: '2026-05-26T06:00:00.000Z' },
  { id: 'we_01HY8T1B4C3D2E1F0G9H8J7K6L', object: 'webhook_endpoint', url: 'https://example.com/pillar/webhooks/risk', description: 'Risk review endpoint', status: 'enabled', enabled_events: ['hold.expired', 'holding.updated'], secret_last4: '2c8d', created: '2026-05-26T06:05:00.000Z' },
  { id: 'we_01HY8T2C5D4E3F2G1H0J9K8L7M', object: 'webhook_endpoint', url: 'https://example.com/pillar/webhooks/audit', description: 'Audit archive endpoint', status: 'disabled', enabled_events: ['event.replayed', 'api_key.created'], secret_last4: '91ab', created: '2026-05-26T06:10:00.000Z' },
  { id: 'we_01HY8T3D6E5F4G3H2J1K0L9M8N', object: 'webhook_endpoint', url: 'https://example.com/pillar/webhooks/settlement', description: 'Settlement endpoint', status: 'enabled', enabled_events: ['redeem_intent.succeeded', 'operation.ledger_committed'], secret_last4: '44ef', created: '2026-05-26T06:15:00.000Z' }
];

const deliveryStatuses: WebhookDeliveryStatus[] = ['pending', 'delivered', 'failed', 'retrying', 'dead_lettered', 'manually_replayed', 'delivered', 'pending', 'retrying', 'failed', 'delivered', 'dead_lettered', 'manually_replayed', 'delivered', 'pending'];
export const webhookDeliveries: WebhookDelivery[] = deliveryStatuses.map((status, index) => ({
  id: `we_${String(index + 10).padStart(2, '0')}HY8U${String(index).padStart(2, '0')}E5F4G3H2J1K0L9M8`,
  object: 'webhook_delivery',
  endpoint_id: webhookEndpoints[index % webhookEndpoints.length].id,
  event_id: events[index % events.length].id,
  status,
  http_status: status === 'delivered' || status === 'manually_replayed' ? 200 : status === 'pending' ? 0 : 503,
  attempt_count: status === 'pending' ? 0 : index % 4 + 1,
  next_retry_at: status === 'retrying' ? `2026-05-26T09:${String(index).padStart(2, '0')}:00.000Z` : undefined,
  delivered_at: status === 'delivered' || status === 'manually_replayed' ? `2026-05-26T08:${String(20 + index).padStart(2, '0')}:00.000Z` : undefined,
  created: `2026-05-26T08:${String(5 + index).padStart(2, '0')}:00.000Z`,
  target: webhookEndpoints[index % webhookEndpoints.length].url,
  type: events[index % events.length].type
}));

export const apiKeys: ApiKey[] = [
  { id: 'ak_01HY8V0D6E5F4G3H2J1K0L9M8N', object: 'api_key', name: 'Server test key', prefix: 'secret_test', last4: '9a2f', status: 'active', scopes: ['accounts:read', 'intents:write'], created: '2026-05-26T06:10:00.000Z' },
  { id: 'ak_01HY8V1E7F6G5H4J3K2L1M0N9P', object: 'api_key', name: 'Live settlement key', prefix: 'secret_live', last4: '1bd4', status: 'active', scopes: ['intents:write', 'webhooks:read'], created: '2026-05-26T06:12:00.000Z' },
  { id: 'ak_01HY8V2F8G7H6J5K4L3M2N1P0Q', object: 'api_key', name: 'Restricted test reader', prefix: 'restricted_test', last4: '77cc', status: 'expired', scopes: ['accounts:read'], created: '2026-05-26T06:14:00.000Z', expires_at: '2026-05-26T08:00:00.000Z' },
  { id: 'ak_01HY8V3G9H8J7K6L5M4N3P2Q1R', object: 'api_key', name: 'Publishable test key', prefix: 'publishable_test', last4: '0f8e', status: 'active', scopes: ['assets:read'], created: '2026-05-26T06:16:00.000Z' },
  { id: 'ak_01HY8V4H0J9K8L7M6N5P4Q3R2S', object: 'api_key', name: 'Restricted live legacy', prefix: 'restricted_live', last4: '5a90', status: 'revoked', scopes: ['events:read'], created: '2026-05-26T06:18:00.000Z' }
];

export const apiRequestLog: ApiRequestLogEntry[] = Array.from({ length: 12 }, (_, index) => ({
  id: `req_01HY8W${String(index).padStart(2, '0')}J9K8L7M6N5P4Q3R2S`,
  object: 'api_request',
  method: ['GET', 'POST', 'GET', 'PATCH'][index % 4],
  path: ['/v1/transfer_intents', '/v1/holdings', '/v1/webhook_endpoints', '/v1/operations'][index % 4],
  status_code: [200, 201, 202, 400, 401, 409][index % 6],
  request_id: `req_01HY8X${String(index).padStart(2, '0')}K8L7M6N5P4Q3R2S1T`,
  api_key: `${apiKeys[index % apiKeys.length].prefix}...${apiKeys[index % apiKeys.length].last4}`,
  latency_ms: 42 + index * 17,
  created: `2026-05-26T08:${String(30 + index).padStart(2, '0')}:00.000Z`
}));

export const operationTrace = operations[0].transitions.map((transition) => ({ step: transition.status, time: transition.at, detail: transition.note, reference: operations[0].id }));

export const getAccountById = (id: string) => accounts.find((item) => item.id === id);
export const getAssetById = (id: string) => assets.find((item) => item.id === id);
export const getHoldingById = (id: string) => holdings.find((item) => item.id === id);
export const getHoldById = (id: string) => holds.find((item) => item.id === id);
export const getOperationById = (id: string) => operations.find((item) => item.id === id);
export const getEventById = (id: string) => events.find((item) => item.id === id);
export const getWebhookEndpointById = (id: string) => webhookEndpoints.find((item) => item.id === id);
export const getDeliveriesForEndpoint = (id: string) => webhookDeliveries.filter((item) => item.endpoint_id === id);
export const getIntentById = (id: string) => [...issueIntents, ...redeemIntents, ...transferIntents].find((item) => item.id === id);
export const getOperationsForIntent = (id: string) => operations.filter((item) => item.intent_id === id || item.resource_id === id);
export const getEventsForObject = (id: string) => events.filter((item) => item.resource_id === id || Object.values(item.data).includes(id));
