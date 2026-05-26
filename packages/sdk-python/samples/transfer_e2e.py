from pillar import Pillar
def run_transfer_sample():
    p=Pillar('sk_test')
    return p.transfer_intents.create({'from_account':'acct_from','to_account':'acct_to','asset':'ast_usdc','amount':'100.00'}, idempotency_key='sample-transfer')
