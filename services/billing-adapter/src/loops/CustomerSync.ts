export class CustomerSync { syncNightly(customers: { id:string }[]) { return customers.map(c => ({ ...c, synced:true })); } }
