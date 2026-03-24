import { NetworkOptions } from "./NetworkOptions";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { ArrowLeftOnRectangleIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useCuryoDisconnect } from "~~/hooks/useCuryoDisconnect";
import { useCuryoSwitchNetwork } from "~~/hooks/useCuryoSwitchNetwork";
import { getTargetNetworks } from "~~/utils/scaffold-eth";

export const WrongNetworkDropdown = () => {
  const disconnect = useCuryoDisconnect();
  const { switchToChain, switchingChainId } = useCuryoSwitchNetwork();
  const allowedNetworks = getTargetNetworks();

  if (allowedNetworks.length === 1) {
    const [targetNetwork] = allowedNetworks;

    return (
      <button
        className="btn btn-error btn-sm mr-2 gap-2"
        disabled={switchingChainId === targetNetwork.id}
        onClick={() => {
          void switchToChain(targetNetwork.id);
        }}
        type="button"
      >
        <ArrowsRightLeftIcon className="h-5 w-5" />
        <span>{switchingChainId === targetNetwork.id ? "Switching..." : "Switch network"}</span>
      </button>
    );
  }

  return (
    <div className="dropdown dropdown-top dropdown-end mr-2">
      <label tabIndex={0} className="btn btn-error btn-sm dropdown-toggle gap-1">
        <span>Wrong network</span>
        <ChevronDownIcon className="h-6 w-4 ml-2 sm:ml-0" />
      </label>
      <ul
        tabIndex={0}
        className="dropdown-content menu p-2 mt-1 shadow-center shadow-accent bg-base-200 rounded-box gap-1"
      >
        <NetworkOptions />
        <li>
          <button
            className="menu-item text-error btn-sm rounded-xl! flex gap-3 py-3"
            type="button"
            onClick={() => void disconnect()}
          >
            <ArrowLeftOnRectangleIcon className="h-6 w-4 ml-2 sm:ml-0" />
            <span>Sign Out</span>
          </button>
        </li>
      </ul>
    </div>
  );
};
