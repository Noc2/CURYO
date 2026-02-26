import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export const BetaBanner = () => {
  return (
    <div className="bg-warning text-warning-content py-2 px-4 text-center text-base font-medium">
      <div className="flex items-center justify-center gap-2">
        <ExclamationTriangleIcon className="h-4 w-4" />
        <span>
          <strong>BETA</strong> - cREP tokens have <strong>NO REAL VALUE</strong>. This is an experimental platform for
          testing only.
        </span>
      </div>
    </div>
  );
};
