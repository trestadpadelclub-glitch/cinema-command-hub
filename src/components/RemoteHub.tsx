import { Tv2, Volume2, Gamepad2, Lightbulb } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ManualControls } from "@/components/ManualControls";
import { MarantzRemote } from "@/components/MarantzRemote";
import { FormulerRemote } from "@/components/FormulerRemote";
import { LightsRemote } from "@/components/LightsRemote";
import type { ProjectorSettings, MarantzStatus } from "@/lib/projector";

interface Props {
  householdCode: string;
  settings: ProjectorSettings;
  onSettingsChange: (s: ProjectorSettings) => void;
  marantzStatus: MarantzStatus | null;
  marantzReachable: boolean | null;
  onMarantzRefresh: () => Promise<void>;
}

export function RemoteHub({
  householdCode,
  settings,
  onSettingsChange,
  marantzStatus,
  marantzReachable,
  onMarantzRefresh,
}: Props) {
  return (
    <Tabs defaultValue="sony" className="w-full">
      <TabsList className="grid w-full grid-cols-4 h-auto">
        <TabsTrigger value="sony" className="flex-col gap-1 py-2">
          <Tv2 className="h-4 w-4" />
          <span className="text-xs">Sony</span>
        </TabsTrigger>
        <TabsTrigger value="marantz" className="flex-col gap-1 py-2">
          <Volume2 className="h-4 w-4" />
          <span className="text-xs">Marantz</span>
        </TabsTrigger>
        <TabsTrigger value="formuler" className="flex-col gap-1 py-2">
          <Gamepad2 className="h-4 w-4" />
          <span className="text-xs">Formuler</span>
        </TabsTrigger>
        <TabsTrigger value="lights" className="flex-col gap-1 py-2">
          <Lightbulb className="h-4 w-4" />
          <span className="text-xs">Lights</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sony" className="mt-4">
        <ManualControls settings={settings} onChange={onSettingsChange} />
      </TabsContent>
      <TabsContent value="marantz" className="mt-4">
        <MarantzRemote householdCode={householdCode} />
      </TabsContent>
      <TabsContent value="formuler" className="mt-4">
        <FormulerRemote
          householdCode={householdCode}
          marantzStatus={marantzStatus}
          marantzReachable={marantzReachable}
          onMarantzRefresh={onMarantzRefresh}
        />
      </TabsContent>
      <TabsContent value="lights" className="mt-4">
        <LightsRemote householdCode={householdCode} />
      </TabsContent>
    </Tabs>
  );
}
