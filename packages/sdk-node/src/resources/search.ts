export class SearchResource { constructor(private client:any){} async query(params:any){ return this.client.request('GET','/v1/search',{ params }); } }
