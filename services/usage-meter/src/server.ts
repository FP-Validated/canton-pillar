import { StreamConsumer } from './consumer/StreamConsumer.js';
import { PartitionManager } from './partitions/PartitionManager.js';
export function boot() { const consumer = new StreamConsumer(); const partitions = new PartitionManager(); partitions.ensureNextMonth(); return { status:'ok', consumer, partitions }; }
if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify({ service:'usage-meter', status:boot().status }));
