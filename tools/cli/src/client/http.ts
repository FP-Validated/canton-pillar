import{request, type Dispatcher}from'undici';export async function api(method:string,url:string){return request(url,{method:method as Dispatcher.HttpMethod})}
