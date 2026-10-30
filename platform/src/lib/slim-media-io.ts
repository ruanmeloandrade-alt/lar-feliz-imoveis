import {createIsomorphicFn} from '@tanstack/react-start';
/** Browser-only IO is loaded inside the framework's client branch, never by SSR. */
export const readSlimMediaFile=createIsomorphicFn()
 .client(async(file:File):Promise<string>=>{const io=await import('./slim-media-file.client');return io.readSlimMediaFile(file);})
 .server(async(_file:File):Promise<string>=>{throw new Error('Selecione o arquivo pelo navegador.');});
export const sendSlimMediaOnce=createIsomorphicFn()
 .client(async(send:(signal:AbortSignal)=>Promise<unknown>):Promise<unknown>=>{const io=await import('./slim-media-file.client');return io.sendSlimMediaOnce(send);})
 .server(async(_send:(signal:AbortSignal)=>Promise<unknown>):Promise<unknown>=>{throw new Error('Inicie o envio pelo Inbox no navegador.');});
