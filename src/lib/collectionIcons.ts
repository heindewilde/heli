import Users from 'lucide-svelte/icons/users';
import User from 'lucide-svelte/icons/user';
import UserCheck from 'lucide-svelte/icons/user-check';
import UserPlus from 'lucide-svelte/icons/user-plus';
import Heart from 'lucide-svelte/icons/heart';
import HeartHandshake from 'lucide-svelte/icons/heart-handshake';
import Globe from 'lucide-svelte/icons/globe';
import Home from 'lucide-svelte/icons/home';
import MapPin from 'lucide-svelte/icons/map-pin';
import Building2 from 'lucide-svelte/icons/building-2';
import Briefcase from 'lucide-svelte/icons/briefcase';
import Rocket from 'lucide-svelte/icons/rocket';
import Target from 'lucide-svelte/icons/target';
import Trophy from 'lucide-svelte/icons/trophy';
import Award from 'lucide-svelte/icons/award';
import Crown from 'lucide-svelte/icons/crown';
import Gem from 'lucide-svelte/icons/gem';
import Zap from 'lucide-svelte/icons/zap';
import DollarSign from 'lucide-svelte/icons/dollar-sign';
import TrendingUp from 'lucide-svelte/icons/trending-up';
import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
import Wallet from 'lucide-svelte/icons/wallet';
import Lightbulb from 'lucide-svelte/icons/lightbulb';
import Brain from 'lucide-svelte/icons/brain';
import BookOpen from 'lucide-svelte/icons/book-open';
import Sparkles from 'lucide-svelte/icons/sparkles';
import Microscope from 'lucide-svelte/icons/microscope';
import Mail from 'lucide-svelte/icons/mail';
import Phone from 'lucide-svelte/icons/phone';
import MessageSquare from 'lucide-svelte/icons/message-square';
import Bell from 'lucide-svelte/icons/bell';
import Send from 'lucide-svelte/icons/send';
import Activity from 'lucide-svelte/icons/activity';
import Flame from 'lucide-svelte/icons/flame';
import Clock from 'lucide-svelte/icons/clock';
import Calendar from 'lucide-svelte/icons/calendar';
import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
import Tag from 'lucide-svelte/icons/tag';
import Bookmark from 'lucide-svelte/icons/bookmark';
import Pin from 'lucide-svelte/icons/pin';
import Star from 'lucide-svelte/icons/star';
import ListTodo from 'lucide-svelte/icons/list-todo';
import Archive from 'lucide-svelte/icons/archive';
import Package from 'lucide-svelte/icons/package';
import Gift from 'lucide-svelte/icons/gift';
import Coffee from 'lucide-svelte/icons/coffee';
import Music from 'lucide-svelte/icons/music';
import Camera from 'lucide-svelte/icons/camera';
import Mic from 'lucide-svelte/icons/mic';
import Flag from 'lucide-svelte/icons/flag';
import Layers from 'lucide-svelte/icons/layers';
import Link from 'lucide-svelte/icons/link';
import Key from 'lucide-svelte/icons/key';
import Shield from 'lucide-svelte/icons/shield';
import Hash from 'lucide-svelte/icons/hash';
import Network from 'lucide-svelte/icons/network';
import Handshake from 'lucide-svelte/icons/handshake';
import Megaphone from 'lucide-svelte/icons/megaphone';
import Plane from 'lucide-svelte/icons/plane';
import Stethoscope from 'lucide-svelte/icons/stethoscope';
import GraduationCap from 'lucide-svelte/icons/graduation-cap';
import TreePine from 'lucide-svelte/icons/tree-pine';

import type { CollectionIconName } from './collectionIconNames';

// The name list lives in a dependency-free module, because it is what gets
// stored in `collections.icon` / `projects.icon` and what a consumer without
// lucide-svelte — the mobile app, which renders the same picker from
// lucide-react-native — needs in order to agree with this one.
export {
  COLLECTION_ICON_NAMES,
  isCollectionIconName,
  type CollectionIconName
} from './collectionIconNames';

// `satisfies` rather than a type annotation, deliberately: it checks that every
// name in COLLECTION_ICON_NAMES has a component here (a missing one is a
// compile error, not a blank square in the picker) while leaving the exported
// map indexable by a plain string — `projects.icon` is `string | null` off the
// wire and several call sites look up with it directly.
const ICONS = {
  Users, User, UserCheck, UserPlus, Heart, HeartHandshake,
  Globe, Home, MapPin, Building2,
  Briefcase, Rocket, Target, Trophy, Award, Crown, Gem, Zap,
  DollarSign, TrendingUp, BarChart3, Wallet,
  Lightbulb, Brain, BookOpen, Sparkles, Microscope,
  Mail, Phone, MessageSquare, Bell, Send,
  Activity, Flame, Clock, Calendar, CheckCircle2,
  Tag, Bookmark, Pin, Star, ListTodo, Archive, Package,
  Gift, Coffee, Music, Camera, Mic, Flag, Layers, Link,
  Key, Shield, Hash, Network, Handshake, Megaphone,
  Plane, Stethoscope, GraduationCap, TreePine
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} satisfies Record<CollectionIconName, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const COLLECTION_ICON_MAP: Record<string, any> = ICONS;
