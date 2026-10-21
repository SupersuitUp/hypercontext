// Zoned Instants retain their full decimal fraction until relative arithmetic is complete.
// Date handles only validated whole seconds, which are exact throughout four-digit years.
export function parseConversationInstant(value) {
 if(typeof value!=='string')return null;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
 if(!m)return null;
 const year=+m[1],month=+m[2],day=+m[3],leap=year%4===0&&(year%100!==0||year%400===0);
 if(month<1||month>12||day<1||day>[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1]||+m[4]>=24||+m[5]>=60||+m[6]>=60||m[9]&&(+m[9]>=24||+m[10]>=60))return null;
 const whole=Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[8]}`);
 if(!Number.isFinite(whole))return null;
 return {seconds:BigInt(whole/1000),fraction:(m[7]??'').replace(/0+$/,'')};
}
const power=scale=>10n**BigInt(scale);
function differenceMilliseconds(left,right) {
 const scale=Math.max(left.fraction.length,right.fraction.length);
 const fraction=value=>BigInt(value.fraction.padEnd(scale,'0')||'0');
 return {units:((left.seconds-right.seconds)*power(scale)+fraction(left)-fraction(right))*1000n,scale};
}
export function compareConversationInstants(left,right) {
 const {units}=differenceMilliseconds(left,right);
 return units<0n?-1:units>0n?1:0;
}
// Convert the declared Number offset's decimal representation, including exponent notation.
// Add it before rounding, so cancellation cannot turn an exact negative offset into zero.
function decimalMilliseconds(value) {
 const [mantissa,exponent='0']=String(value).split('e');
 let units=BigInt(mantissa.replace('.','')),scale=(mantissa.split('.')[1]?.length??0)-Number(exponent);
 if(scale<0){units*=power(-scale);scale=0;}
 return {units,scale};
}
export function conversationCaptureOffsetMs(at,anchor,captureStartMs) {
 const delta=differenceMilliseconds(at,anchor),base=decimalMilliseconds(captureStartMs);
 const scale=Math.max(delta.scale,base.scale);
 const units=delta.units*power(scale-delta.scale)+base.units*power(scale-base.scale);
 return {value:Number(`${units}e-${scale}`),negative:units<0n};
}
