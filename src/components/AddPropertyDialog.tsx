"use client";

import { useState } from "react";
import { dict, type Lang } from "@/lib/i18n";
import type { PropertyItem } from "@/lib/types";
import { PROPERTY_TYPES, OWNERSHIP_TYPES } from "@/lib/etraffic";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// "Property" modal: type (from config list) + ownership + address (80 chars).
export default function AddPropertyDialog({
  lang,
  open,
  onOpenChange,
  onAdd,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (p: PropertyItem) => void;
}) {
  const t = dict[lang];
  const [type, setType] = useState("");
  const [ownership, setOwnership] = useState<string>(t.ownPrivate);
  const [address, setAddress] = useState("");
  const [touched, setTouched] = useState(false);

  const valid = type && ownership && address.trim().length > 0;

  function reset() {
    setType("");
    setOwnership(t.ownPrivate);
    setAddress("");
    setTouched(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.propertyTitle}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label>{t.propertyType}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1 h-11">
                <SelectValue placeholder={t.propertyType} />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t.ownershipType}</Label>
            <RadioGroup value={ownership} onValueChange={setOwnership} className="mt-2 gap-2">
              {[t.ownPrivate, t.ownPublic].map((o, i) => (
                <div key={o} className="flex items-center gap-2">
                  <RadioGroupItem value={OWNERSHIP_TYPES[i]} id={`own-${i}`} />
                  <Label htmlFor={`own-${i}`} className="cursor-pointer font-normal">
                    {o}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="prop-addr">{t.propertyAddress}</Label>
              <span className="text-xs text-muted-foreground">{address.length}/80</span>
            </div>
            <Input
              id="prop-addr"
              maxLength={80}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1"
            />
          </div>

          {touched && !valid && (
            <p className="text-sm text-destructive">{t.fillCorrectly}</p>
          )}

          <Button
            className="h-12 font-bold"
            onClick={() => {
              if (!valid) return setTouched(true);
              onAdd({ type, ownership, address: address.trim() });
              reset();
              onOpenChange(false);
            }}
          >
            {t.submitBtn}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
