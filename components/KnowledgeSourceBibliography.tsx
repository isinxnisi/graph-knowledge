export default function KnowledgeSourceBibliography({value,locale='ja',className}:{value:string;locale?:string;className?:string}){
 const trace=/^取得原本SHA256 ([a-f0-9]{64}) \/ text ([a-f0-9]{64})$/.exec(value);
 if(!trace)return <p className={className}>{value}</p>;
 const en=locale==='en';
 return <details className={className}><summary>{en?'Capture details':'取得時の記録'}</summary>
  <p>{en?'Original SHA-256':'原本 SHA-256'}<br/><code style={{overflowWrap:'anywhere'}}>{trace[1]}</code></p>
  <p>{en?'Extracted text SHA-256':'抽出テキスト SHA-256'}<br/><code style={{overflowWrap:'anywhere'}}>{trace[2]}</code></p>
 </details>;
}
