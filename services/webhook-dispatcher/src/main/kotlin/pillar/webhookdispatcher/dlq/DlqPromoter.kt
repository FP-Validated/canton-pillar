package pillar.webhookdispatcher.dlq
class DlqPromoter { fun promote(attempts:Int,max:Int)=attempts>=max }
