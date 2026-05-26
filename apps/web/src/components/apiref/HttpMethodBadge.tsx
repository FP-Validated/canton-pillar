type HttpMethodBadgeProps = {
  method: 'GET' | 'POST' | 'DELETE';
};

const methodClass = {
  GET: 'bg-blue-50 text-blue-700 ring-blue-100',
  POST: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  DELETE: 'bg-red-50 text-red-700 ring-red-100',
};

export function HttpMethodBadge({ method }: HttpMethodBadgeProps) {
  return <span className={`rounded-md px-2 py-1 text-xs font-bold ring-1 ${methodClass[method]}`}>{method}</span>;
}
