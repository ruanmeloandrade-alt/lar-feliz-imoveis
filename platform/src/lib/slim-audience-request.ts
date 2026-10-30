// Keep an unchanged request ID through an ambiguous failure, then reset after acknowledgement.
export function createAudienceRequestTracker(){
 let fingerprint='';let id='';
 const track=(payload:unknown)=>{const next=JSON.stringify(payload);if(next!==fingerprint||!id){fingerprint=next;id=crypto.randomUUID();}return id;};
 track.reset=()=>{fingerprint='';id='';};return track;
}
