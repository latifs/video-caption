import { cssInterop } from "nativewind";
import {
  ArrowLeft,
  ChevronDown,
  Maximize,
  Menu,
  Moon,
  Pause,
  Play,
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
iconWithClassName(ChevronDown);
iconWithClassName(Maximize);
iconWithClassName(Menu);
iconWithClassName(Moon);
iconWithClassName(Pause);
iconWithClassName(Play);
iconWithClassName(Sun);
iconWithClassName(X);

export { ArrowLeft, ChevronDown, Maximize, Menu, Moon, Pause, Play, Sun, X };
