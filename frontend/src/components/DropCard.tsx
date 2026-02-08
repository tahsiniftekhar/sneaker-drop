import { Clock, ShoppingCart, UserCheck } from 'lucide-react';
import React from 'react';
import { useDropActions } from '../hooks/useDropActions';
import { type Drop } from '../types';

interface Props {
  drop: Drop;
}

export const DropCard: React.FC<Props> = ({ drop }) => {
  const { loading, isPurchased, reservationId, timeLeft, handleReserve, handlePurchase } =
    useDropActions(drop.id, drop.name);

  const stockPercent = (drop.availableStock / drop.totalStock) * 100;
  const totalStock = drop.totalStock;

  return (
    <div className="bg-neutral-900 rounded-2xl border border-neutral-800 shadow-xl hover:shadow-2xl hover:shadow-indigo-500/20 transition-all duration-300 flex flex-col h-full group">
      <div className="h-52 bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center text-neutral-600 group-hover:text-indigo-500/50 transition-colors duration-300 relative overflow-hidden rounded-t-2xl">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
        <ShoppingCart size={56} strokeWidth={1.5} />
      </div>

      <div className="p-6 flex flex-col flex-grow">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xl font-bold text-white leading-tight">{drop.name}</h3>
          <span className="px-3 py-1 bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 rounded-full text-sm font-medium">
            ${drop.price}
          </span>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-sm font-medium text-neutral-400 mb-2">
            <span>Stock</span>
            <span className={drop.availableStock > 0 ? 'text-emerald-400' : 'text-rose-500'}>
              {drop.availableStock} / {totalStock} left
            </span>
          </div>

          <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                drop.availableStock > 0 ? 'bg-emerald-500' : 'bg-rose-500'
              } ${drop.availableStock > 0 ? 'shadow-md shadow-emerald-500/30' : ''}`}
              style={{ width: `${stockPercent}%` }}
            />
          </div>
        </div>

        <div className="bg-neutral-800/60 border border-neutral-700 rounded-lg p-4 mb-6">
          <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 flex items-center">
            <UserCheck size={14} className="mr-2 text-indigo-400" />
            Recent buyers
          </h4>

          <ul className="space-y-2">
            {drop.Purchases && drop.Purchases.length > 0 ? (
              drop.Purchases.slice(0, 3).map((p) => (
                <li key={p.id} className="text-sm text-neutral-300 font-medium flex items-center">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mr-2 shadow-sm shadow-indigo-500/50" />
                  {p.User.username}
                </li>
              ))
            ) : (
              <p className="text-sm text-neutral-500 italic">No recent buyers yet.</p>
            )}
          </ul>
        </div>

        <div className="mt-auto border-t border-neutral-800 pt-5">
          {isPurchased ? (
            <div className="w-full py-3.5 bg-emerald-900/30 text-emerald-300 text-center font-semibold rounded-lg border border-emerald-700/50 shadow-inner shadow-emerald-900/20">
              Item secured
            </div>
          ) : reservationId ? (
            <button
              onClick={handlePurchase}
              disabled={loading}
              className="w-full py-4 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg font-bold transition-all flex flex-col items-center justify-center relative overflow-hidden shadow-lg shadow-indigo-900/30"
            >
              <span className="text-sm">Complete purchase</span>
              <span
                className={`text-[10px] mt-1 flex items-center ${
                  timeLeft <= 10 ? 'text-rose-300 animate-pulse' : 'text-indigo-300'
                }`}
              >
                <Clock size={10} className="mr-1" />
                Expires in {timeLeft}s
              </span>

              <div
                className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all duration-1000 ease-linear"
                style={{ width: `${(timeLeft / 60) * 100}%` }}
              />
            </button>
          ) : (
            <button
              onClick={handleReserve}
              disabled={loading || drop.availableStock === 0}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold disabled:bg-neutral-800 disabled:text-neutral-600 transition-all shadow-md shadow-indigo-600/20"
            >
              {loading ? 'Reserving...' : drop.availableStock === 0 ? 'Sold out' : 'Reserve spot'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DropCard;
