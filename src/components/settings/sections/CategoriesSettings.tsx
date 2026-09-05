import { Tags } from "lucide-react";
import { SettingsSection } from "../../ui/PageHeader";
import { CategoryManager } from "../CategoryManager";

export function CategoriesSettings() {
  return (
    <div className="grid gap-4">
      <SettingsSection
        icon={Tags}
        title="Categories"
        description="Organize tasks by area. Pick a color so they stand out across the app."
      >
        <CategoryManager />
      </SettingsSection>
    </div>
  );
}
