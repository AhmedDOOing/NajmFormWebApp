"use client";

import { useState } from "react";
import { dict, type Lang, type Dict } from "@/lib/i18n";
import type { DriverInfo, VehicleInfo } from "@/lib/types";
import {
  VEHICLE_NATIONALITIES,
  REGISTRATION_TYPES,
  IDENTITY_TYPES,
} from "@/lib/etraffic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface AffectedEntry {
  vehicle: VehicleInfo;
  driver: DriverInfo;
  lookupFailed: boolean;
}

// NOTE: these field components are module-level (not defined inside the dialog)
// so they don't remount on every keystroke — otherwise the input loses focus.
function TextField({
  label,
  value,
  onChange,
  t,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  t: Dict;
  type?: string;
  inputMode?: "numeric" | "tel";
}) {
  return (
    <div>
      <Label>
        {label} <span className="text-destructive">*</span>
      </Label>
      <Input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${t.enter} ${label}`}
        className="mt-1 h-11"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  t,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  t: Dict;
}) {
  return (
    <div>
      <Label>
        {label} <span className="text-destructive">*</span>
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 h-11">
          <SelectValue placeholder={`${t.select} ${label}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Add the other party by filling the SAME details form as the reporting driver
// (manual entry — not a vehicle-number/ID lookup).
export default function AddAffectedDialog({
  lang,
  title,
  open,
  onOpenChange,
  onAdd,
}: {
  lang: Lang;
  title: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (e: AffectedEntry) => void;
}) {
  const t = dict[lang];
  const [vNationality, setVNationality] = useState("");
  const [vNumber, setVNumber] = useState("");
  const [vReg, setVReg] = useState("");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");

  const filled = vNationality && vNumber && vReg && idType && idNumber && name && mobile && email;

  function reset() {
    setVNationality(""); setVNumber(""); setVReg("");
    setIdType(""); setIdNumber(""); setName(""); setMobile(""); setEmail("");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="text-xs font-semibold uppercase text-muted-foreground">{t.vehicleDetails}</div>
          <SelectField label={t.vehicleNationality} value={vNationality} onChange={setVNationality} options={VEHICLE_NATIONALITIES} t={t} />
          <TextField label={t.vehicleNumber} value={vNumber} onChange={setVNumber} inputMode="numeric" t={t} />
          <SelectField label={t.registrationType} value={vReg} onChange={setVReg} options={REGISTRATION_TYPES} t={t} />

          <div className="mt-1 text-xs font-semibold uppercase text-muted-foreground">{t.driverDetails}</div>
          <SelectField label={t.identityTypeLbl} value={idType} onChange={setIdType} options={IDENTITY_TYPES} t={t} />
          <TextField label={t.identityNumber} value={idNumber} onChange={setIdNumber} inputMode="numeric" t={t} />
          <TextField label={t.fullNameLbl} value={name} onChange={setName} t={t} />
          <TextField label={t.mobileLbl} value={mobile} onChange={setMobile} type="tel" t={t} />
          <TextField label={t.emailLbl} value={email} onChange={setEmail} type="email" t={t} />

          <Button
            className="h-12 font-bold"
            disabled={!filled}
            onClick={() => {
              onAdd({
                vehicle: { nationality: vNationality, number: vNumber, registrationType: vReg },
                driver: { identityType: idType, identityNumber: idNumber, fullName: name, mobile, email },
                lookupFailed: false,
              });
              reset();
              onOpenChange(false);
            }}
          >
            {t.addToReport}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
