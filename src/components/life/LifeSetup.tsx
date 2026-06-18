import { useState } from "react";
import {
  MAX_LIFE_EXPECTANCY,
  MIN_LIFE_EXPECTANCY,
  parseLocalDate
} from "../../utils/lifeWeeks";
import { Button } from "../ui/Button";
import { Field, Input } from "../ui/Field";

type LifeSetupProps = {
  birthDate: string;
  lifeExpectancyYears: number;
  submitLabel?: string;
  onSave: (birthDate: string, lifeExpectancyYears: number) => void;
  onCancel?: () => void;
};

const TODAY_ISO = new Date().toISOString().slice(0, 10);

/**
 * Collects the two inputs the Life grid needs: a birth date and a
 * life-expectancy horizon. Used both as the first-run empty state and as the
 * inline "Adjust" editor.
 */
export function LifeSetup({
  birthDate,
  lifeExpectancyYears,
  submitLabel = "Reveal my life",
  onSave,
  onCancel
}: LifeSetupProps) {
  const [date, setDate] = useState(birthDate);
  const [years, setYears] = useState(String(lifeExpectancyYears));

  const parsedYears = Number(years);
  const validYears =
    Number.isFinite(parsedYears) &&
    parsedYears >= MIN_LIFE_EXPECTANCY &&
    parsedYears <= MAX_LIFE_EXPECTANCY;
  const validDate = parseLocalDate(date) !== null && date <= TODAY_ISO;
  const canSave = validDate && validYears;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    onSave(date, Math.round(parsedYears));
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Your birth date"
          hint="Used to map your life in weeks."
          error={date && !validDate ? "Pick a real date in the past." : undefined}
        >
          <Input
            type="date"
            value={date}
            max={TODAY_ISO}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field
          label="Life expectancy"
          hint={`Years to map (${MIN_LIFE_EXPECTANCY}–${MAX_LIFE_EXPECTANCY}).`}
          error={years && !validYears ? "Enter a value between 1 and 130." : undefined}
        >
          <Input
            type="number"
            min={MIN_LIFE_EXPECTANCY}
            max={MAX_LIFE_EXPECTANCY}
            value={years}
            onChange={(event) => setYears(event.target.value)}
          />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!canSave}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
