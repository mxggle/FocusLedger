import * as RadixSwitch from "@radix-ui/react-switch";
import { cn } from "../../utils/cn";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
};

export function Switch({ checked, onChange, disabled, label }: SwitchProps) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "group relative inline-flex h-[24px] w-[42px] shrink-0 cursor-pointer items-center rounded-full",
        "border border-transparent p-[2px] outline-none transition-colors duration-normal",
        "focus-visible:shadow-ring",
        "data-[state=unchecked]:bg-muted data-[state=unchecked]:shadow-[inset_0_1px_2px_rgba(17,24,39,0.12)]",
        "yolo-brand-gradient-checked data-[state=checked]:bg-primary data-[state=checked]:shadow-[inset_0_1px_2px_rgba(17,24,39,0.18)]",
        "disabled:cursor-not-allowed disabled:opacity-50"
      )}
    >
      <RadixSwitch.Thumb
        className={cn(
          "pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-sm",
          "transition-transform duration-normal ease-spring",
          "data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0",
          "group-active:w-[22px] group-active:data-[state=checked]:translate-x-[14px]"
        )}
      />
    </RadixSwitch.Root>
  );
}
