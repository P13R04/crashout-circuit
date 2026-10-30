/** Single-range responses let browsers seek and loop streamed music without downloading it again. */
export function audioByteRange(header:string,size:number):{start:number;end:number}|null {
  const match=/^bytes=(\d*)-(\d*)$/.exec(header);if(!match||(!match[1]&&!match[2])||size<=0)return null;
  const first=match[1]?Number(match[1]):null,last=match[2]?Number(match[2]):null;
  if(first!==null&&!Number.isSafeInteger(first)||last!==null&&!Number.isSafeInteger(last))return null;
  if(first===null){if(last===null||last<=0)return null;return{start:Math.max(0,size-last),end:size-1};}
  const end=last===null?size-1:Math.min(size-1,last);
  return first>=size||first>end?null:{start:first,end};
}
