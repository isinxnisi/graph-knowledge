/** Verified ChatGPT attachment delivery origins. Do not allow arbitrary Azure tenants. */
export function editorialAttachmentHost(hostname:string){
 return hostname==='files.oaiusercontent.com'||hostname.endsWith('.files.oaiusercontent.com')
  ||hostname==='oaisdmntprkoreacentral.blob.core.windows.net';
}
