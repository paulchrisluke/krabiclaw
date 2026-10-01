import {isCurrencyCode} from './currencies'
import {formatMinorAmount} from './prices'
/** One catalog currency formatter for payment principal and fee projections. */
export function paymentMoney(amount:unknown,currency:unknown):string {
 const value=Number(amount)
 if(!Number.isSafeInteger(value)||!isCurrencyCode(currency))throw new Error('Invalid currency-safe payment amount')
 return `${value<0?'-':''}${formatMinorAmount(Math.abs(value),currency)}`
}
