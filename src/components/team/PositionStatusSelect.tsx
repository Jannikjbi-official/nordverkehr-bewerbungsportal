"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setPositionStatusAction } from "@/app/actions/admin";
import { Select } from "@/components/Select";
import { POSITION_STATUS_OPTIONS, type PositionStatusValue } from "@/lib/positions-status";

export function PositionStatusSelect({ positionId, status }: { positionId: string; status: PositionStatusValue }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      ariaLabel="Status der Position"
      size="sm"
      className="w-44"
      options={POSITION_STATUS_OPTIONS}
      value={status}
      disabled={pending}
      onChange={(v) =>
        start(async () => {
          const res = await setPositionStatusAction(positionId, v);
          if (!res.ok) alert(res.error);
          router.refresh();
        })
      }
    />
  );
}
