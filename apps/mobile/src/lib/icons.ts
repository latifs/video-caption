import { cssInterop } from "nativewind";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Eye,
  Maximize,
  Menu,
  Moon,
  Palette,
  Pause,
  PenLine,
  Play,
  Star,
  Sun,
  X,
} from "lucide-react-native";
import type { ComponentType } from "react";

function iconWithClassName(icon: ComponentType<any>) {
  cssInterop(icon, {
    className: {
      target: "style",
      nativeStyleToProp: {
        color: true,
        opacity: true,
      },
    },
  });
}

iconWithClassName(ArrowLeft);
iconWithClassName(Check);
iconWithClassName(ChevronDown);
iconWithClassName(Download);
iconWithClassName(Eye);
iconWithClassName(Maximize);
iconWithClassName(Menu);
iconWithClassName(Moon);
iconWithClassName(Palette);
iconWithClassName(Pause);
iconWithClassName(PenLine);
iconWithClassName(Play);
iconWithClassName(Star);
iconWithClassName(Sun);
iconWithClassName(X);

export { ArrowLeft, Check, ChevronDown, Download, Eye, Maximize, Menu, Moon, Palette, Pause, PenLine, Play, Star, Sun, X };
