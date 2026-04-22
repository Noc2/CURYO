"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Address, encodeFunctionData, formatUnits, isAddress, parseUnits } from "viem";
import { useAccount, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import {
  getProposalDescriptionHash,
  governorAbi,
  useGovernanceContracts,
  useGovernanceStats,
  useGovernanceWrite,
} from "~~/hooks/useGovernance";

type ComposerFieldType = "address" | "uint" | "crep" | "string" | "textarea" | "csv" | "bytes32";

type ComposerField = {
  key: string;
  label: string;
  type: ComposerFieldType;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
};

type FieldParser = {
  address: (key: string, label: string) => Address;
  uint: (key: string, label: string) => bigint;
  crep: (key: string, label: string) => bigint;
  bytes32: (key: string, label: string) => `0x${string}`;
  string: (key: string, label: string) => string;
  csv: (key: string) => string[];
};

type GovernanceActionTemplate = {
  id: string;
  group: string;
  label: string;
  mode: "proposal" | "direct";
  contractName: "CuryoGovernor" | "CuryoReputation" | "FrontendRegistry" | "ContentRegistry";
  functionName: string;
  description: string;
  allowCustomDescription?: boolean;
  note?: string;
  advanced?: boolean;
  fields: readonly ComposerField[];
  buildArgs: (
    values: Record<string, string>,
    parser: FieldParser,
    descriptionHash?: `0x${string}`,
  ) => readonly unknown[];
  buildDescription?: (values: Record<string, string>) => string;
};

const TREASURY_GRANT_ACTION_ID = "treasury-grant";

function cleanDescriptionValue(value: string | undefined, fallback: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : fallback;
}

function buildTreasuryGrantDescription(values: Record<string, string>) {
  const amount = cleanDescriptionValue(values.amount, "0");
  const recipient = cleanDescriptionValue(values.recipient, "recipient");
  const recipientType = cleanDescriptionValue(values.recipientType, "Unspecified");
  const track = cleanDescriptionValue(values.track, "Unspecified");
  const purpose = cleanDescriptionValue(values.purpose, "Unspecified");
  const impact = cleanDescriptionValue(values.impact, "Unspecified");
  const milestones = cleanDescriptionValue(values.milestones, "Unspecified");

  return [
    `Treasury grant: ${amount} cREP to ${recipient}`,
    "",
    `Track: ${track}`,
    `Recipient type: ${recipientType}`,
    `Purpose: ${purpose}`,
    `Expected impact: ${impact}`,
    `Milestones/reporting: ${milestones}`,
    "",
    "This proposal transfers cREP from the governance timelock treasury to the recipient. cREP carries voting power and is intended for protocol-aligned ecosystem participation, not as a protocol-backed payment.",
  ].join("\n");
}

function parsePreviewCrepAmount(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  try {
    const amount = parseUnits(trimmed, 6);
    return amount > 0n ? amount : undefined;
  } catch {
    return undefined;
  }
}

function formatCRepAmount(value: bigint | undefined) {
  if (value === undefined) return "—";

  const formatted = formatUnits(value, 6);
  const [whole, fraction = ""] = formatted.split(".");
  const wholePart = Number(whole).toLocaleString();
  const trimmedFraction = fraction.replace(/0+$/, "").slice(0, 2);

  return trimmedFraction ? `${wholePart}.${trimmedFraction} cREP` : `${wholePart} cREP`;
}

function formatPercentOf(value: bigint | undefined, total: bigint | undefined) {
  if (value === undefined || total === undefined || total === 0n) return "—";
  if (value > 0n && (value * 10_000n) / total === 0n) return "<0.01%";

  const percentTimes100 = Number((value * 10_000n) / total);
  return `${(percentTimes100 / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

const actionTemplates: readonly GovernanceActionTemplate[] = [
  {
    id: "governor-set-voting-delay",
    group: "Governor",
    label: "Set voting delay",
    mode: "proposal",
    contractName: "CuryoGovernor",
    functionName: "setVotingDelay",
    description: "Create a proposal to update the governor's voting delay in blocks.",
    fields: [{ key: "delay", label: "Voting delay (blocks)", type: "uint", required: true }],
    buildArgs: (_, parser) => [parser.uint("delay", "Voting delay")],
    buildDescription: values => `Set governor voting delay to ${values.delay || "0"} blocks`,
  },
  {
    id: "governor-set-voting-period",
    group: "Governor",
    label: "Set voting period",
    mode: "proposal",
    contractName: "CuryoGovernor",
    functionName: "setVotingPeriod",
    description: "Create a proposal to update the governor's voting period in blocks.",
    fields: [{ key: "period", label: "Voting period (blocks)", type: "uint", required: true }],
    buildArgs: (_, parser) => [parser.uint("period", "Voting period")],
    buildDescription: values => `Set governor voting period to ${values.period || "0"} blocks`,
  },
  {
    id: "governor-set-threshold",
    group: "Governor",
    label: "Set proposal threshold",
    mode: "proposal",
    contractName: "CuryoGovernor",
    functionName: "setProposalThreshold",
    description: "Create a proposal to update the cREP required to create new proposals.",
    fields: [{ key: "threshold", label: "Proposal threshold (cREP)", type: "crep", required: true }],
    buildArgs: (_, parser) => [parser.crep("threshold", "Proposal threshold")],
    buildDescription: values => `Set proposal threshold to ${values.threshold || "0"} cREP`,
  },
  {
    id: "governor-update-quorum",
    group: "Governor",
    label: "Update quorum numerator",
    mode: "proposal",
    contractName: "CuryoGovernor",
    functionName: "updateQuorumNumerator",
    description: "Create a proposal to update the quorum percentage used by the governor.",
    fields: [{ key: "quorum", label: "Quorum numerator (%)", type: "uint", required: true }],
    buildArgs: (_, parser) => [parser.uint("quorum", "Quorum numerator")],
    buildDescription: values => `Update governor quorum numerator to ${values.quorum || "0"}%`,
  },
  {
    id: TREASURY_GRANT_ACTION_ID,
    group: "Treasury",
    label: "Treasury grant",
    mode: "proposal",
    contractName: "CuryoReputation",
    functionName: "transfer",
    description: "Create a proposal to send cREP from the governance timelock treasury to a recipient.",
    allowCustomDescription: false,
    fields: [
      {
        key: "recipient",
        label: "Recipient address",
        type: "address",
        required: true,
        helperText: "The wallet or multisig that will receive the grant and its voting power.",
      },
      {
        key: "amount",
        label: "Grant amount (cREP)",
        type: "crep",
        required: true,
        helperText: "Use a narrow amount that matches the requested ecosystem role.",
      },
      {
        key: "track",
        label: "Grant track",
        type: "string",
        required: true,
        placeholder: "Partner activation, integration support, research/data, community growth, protocol development",
      },
      {
        key: "recipientType",
        label: "Recipient type",
        type: "string",
        required: true,
        placeholder: "Company, integration partner, researcher, community contributor",
      },
      {
        key: "purpose",
        label: "Purpose",
        type: "textarea",
        required: true,
        helperText: "Explain why this recipient should hold cREP.",
      },
      {
        key: "impact",
        label: "Expected impact",
        type: "textarea",
        required: true,
        helperText: "Describe how this helps grow or improve the Curyo feedback network.",
      },
      {
        key: "milestones",
        label: "Milestones / reporting expectations",
        type: "textarea",
        required: true,
        helperText: "State any deliverables, reporting cadence, or follow-up evidence voters should expect.",
      },
    ],
    buildArgs: (_, parser) => {
      const amount = parser.crep("amount", "Grant amount");
      if (amount <= 0n) throw new Error("Grant amount must be greater than 0 cREP.");
      return [parser.address("recipient", "Recipient address"), amount];
    },
    buildDescription: buildTreasuryGrantDescription,
  },
  {
    id: "frontend-slash",
    group: "Frontend Registry",
    label: "Slash frontend",
    mode: "proposal",
    contractName: "FrontendRegistry",
    functionName: "slashFrontend",
    description: "Create a proposal to slash a frontend's stake and disable it.",
    fields: [
      { key: "frontend", label: "Frontend address", type: "address", required: true },
      { key: "amount", label: "Slash amount (cREP)", type: "crep", required: true },
      { key: "reason", label: "Reason", type: "textarea", required: true },
    ],
    buildArgs: (_, parser) => [
      parser.address("frontend", "Frontend address"),
      parser.crep("amount", "Slash amount"),
      parser.string("reason", "Reason"),
    ],
    buildDescription: values => `Slash frontend ${values.frontend || "address"} by ${values.amount || "0"} cREP`,
  },
  {
    id: "frontend-unslash",
    group: "Frontend Registry",
    label: "Unslash frontend",
    mode: "proposal",
    contractName: "FrontendRegistry",
    functionName: "unslashFrontend",
    description: "Create a proposal to clear the slashed status on a frontend.",
    fields: [{ key: "frontend", label: "Frontend address", type: "address", required: true }],
    buildArgs: (_, parser) => [parser.address("frontend", "Frontend address")],
    buildDescription: values => `Unslash frontend ${values.frontend || "address"}`,
  },
  {
    id: "frontend-set-voter-id",
    group: "Frontend Registry",
    label: "Set frontend Voter ID contract",
    mode: "proposal",
    contractName: "FrontendRegistry",
    functionName: "setVoterIdNFT",
    description: "Create a proposal to update the VoterIdNFT used by FrontendRegistry.",
    advanced: true,
    fields: [{ key: "voterId", label: "VoterIdNFT address", type: "address", required: true }],
    buildArgs: (_, parser) => [parser.address("voterId", "VoterIdNFT address")],
    buildDescription: values => `Set FrontendRegistry VoterIdNFT to ${values.voterId || "address"}`,
  },
  {
    id: "frontend-set-voting-engine",
    group: "Frontend Registry",
    label: "Set frontend voting engine",
    mode: "proposal",
    contractName: "FrontendRegistry",
    functionName: "setVotingEngine",
    description: "Create a proposal to update the voting engine used by FrontendRegistry.",
    advanced: true,
    fields: [{ key: "votingEngine", label: "Voting engine address", type: "address", required: true }],
    buildArgs: (_, parser) => [parser.address("votingEngine", "Voting engine address")],
    buildDescription: values => `Set FrontendRegistry voting engine to ${values.votingEngine || "address"}`,
  },
  {
    id: "frontend-add-fee-creditor",
    group: "Frontend Registry",
    label: "Add fee creditor",
    mode: "proposal",
    contractName: "FrontendRegistry",
    functionName: "addFeeCreditor",
    description: "Create a proposal to grant fee-creditor permissions to a contract.",
    advanced: true,
    fields: [{ key: "creditor", label: "Creditor address", type: "address", required: true }],
    buildArgs: (_, parser) => [parser.address("creditor", "Creditor address")],
    buildDescription: values => `Grant FrontendRegistry fee-creditor role to ${values.creditor || "address"}`,
  },
  {
    id: "frontend-remove-fee-creditor",
    group: "Frontend Registry",
    label: "Remove fee creditor",
    mode: "proposal",
    contractName: "FrontendRegistry",
    functionName: "removeFeeCreditor",
    description: "Create a proposal to revoke fee-creditor permissions from a contract.",
    advanced: true,
    fields: [{ key: "creditor", label: "Creditor address", type: "address", required: true }],
    buildArgs: (_, parser) => [parser.address("creditor", "Creditor address")],
    buildDescription: values => `Revoke FrontendRegistry fee-creditor role from ${values.creditor || "address"}`,
  },
  {
    id: "content-mark-dormant",
    group: "Content Registry",
    label: "Mark content dormant",
    mode: "direct",
    contractName: "ContentRegistry",
    functionName: "markDormant",
    description: "Directly mark content dormant once the on-chain dormancy conditions are met.",
    fields: [{ key: "contentId", label: "Content ID", type: "uint", required: true }],
    buildArgs: (_, parser) => [parser.uint("contentId", "Content ID")],
  },
  {
    id: "content-pause",
    group: "Content Registry",
    label: "Pause content registry",
    mode: "proposal",
    contractName: "ContentRegistry",
    functionName: "pause",
    description: "Create a proposal to pause content submissions and revivals.",
    fields: [],
    buildArgs: () => [],
    buildDescription: () => "Pause ContentRegistry",
  },
  {
    id: "content-unpause",
    group: "Content Registry",
    label: "Unpause content registry",
    mode: "proposal",
    contractName: "ContentRegistry",
    functionName: "unpause",
    description: "Create a proposal to resume content submissions and revivals.",
    fields: [],
    buildArgs: () => [],
    buildDescription: () => "Unpause ContentRegistry",
  },
  {
    id: "content-set-voting-engine",
    group: "Content Registry",
    label: "Set content voting engine",
    mode: "proposal",
    contractName: "ContentRegistry",
    functionName: "setVotingEngine",
    description: "Create a proposal to update the voting engine used by ContentRegistry.",
    advanced: true,
    fields: [{ key: "votingEngine", label: "Voting engine address", type: "address", required: true }],
    buildArgs: (_, parser) => [parser.address("votingEngine", "Voting engine address")],
    buildDescription: values => `Set ContentRegistry voting engine to ${values.votingEngine || "address"}`,
  },
  {
    id: "content-set-voter-id",
    group: "Content Registry",
    label: "Set content Voter ID contract",
    mode: "proposal",
    contractName: "ContentRegistry",
    functionName: "setVoterIdNFT",
    description: "Create a proposal to update the VoterIdNFT used by ContentRegistry.",
    advanced: true,
    fields: [{ key: "voterId", label: "VoterIdNFT address", type: "address", required: true }],
    buildArgs: (_, parser) => [parser.address("voterId", "VoterIdNFT address")],
    buildDescription: values => `Set ContentRegistry VoterIdNFT to ${values.voterId || "address"}`,
  },
  {
    id: "content-set-participation-pool",
    group: "Content Registry",
    label: "Set participation pool",
    mode: "proposal",
    contractName: "ContentRegistry",
    functionName: "setParticipationPool",
    description: "Create a proposal to update the ParticipationPool used by ContentRegistry.",
    advanced: true,
    fields: [{ key: "participationPool", label: "ParticipationPool address", type: "address", required: true }],
    buildArgs: (_, parser) => [parser.address("participationPool", "ParticipationPool address")],
    buildDescription: values => `Set ContentRegistry ParticipationPool to ${values.participationPool || "address"}`,
  },
  {
    id: "content-set-bonus-pool",
    group: "Content Registry",
    label: "Set cancellation fee sink",
    mode: "proposal",
    contractName: "ContentRegistry",
    functionName: "setBonusPool",
    description:
      "Create a proposal to update the address that receives cancellation fees. The default should be treasury.",
    advanced: true,
    fields: [{ key: "bonusPool", label: "Fee sink address", type: "address", required: true }],
    buildArgs: (_, parser) => [parser.address("bonusPool", "Fee sink address")],
    buildDescription: values => `Set ContentRegistry cancellation fee sink to ${values.bonusPool || "address"}`,
  },
  {
    id: "content-set-treasury",
    group: "Content Registry",
    label: "Set treasury",
    mode: "proposal",
    contractName: "ContentRegistry",
    functionName: "setTreasury",
    description: "Create a proposal to update the treasury that receives protocol fees.",
    advanced: true,
    fields: [{ key: "treasury", label: "Treasury address", type: "address", required: true }],
    buildArgs: (_, parser) => [parser.address("treasury", "Treasury address")],
    buildDescription: values => `Set ContentRegistry treasury to ${values.treasury || "address"}`,
  },
];

export function GovernanceActionComposer() {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const wagmiConfig = useConfig();
  const { governorAddress, hasGovernorContract, isGovernorContractLoading, knownContractsByName, timelockAddress } =
    useGovernanceContracts();
  const { currentQuorum, proposalThreshold } = useGovernanceStats();
  const { writeContractAsync, isPending } = useGovernanceWrite();
  const [selectedActionId, setSelectedActionId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [customDescription, setCustomDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: votingPowerRaw } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "getVotes" as any,
    args: [address] as any,
    query: { enabled: !!address },
  });

  const votingPower = votingPowerRaw as bigint | undefined;

  const visibleTemplates = useMemo(
    () => actionTemplates.filter(template => showAdvanced || !template.advanced),
    [showAdvanced],
  );

  const selectedTemplate = visibleTemplates.find(template => template.id === selectedActionId);
  const isTreasuryGrant = selectedTemplate?.id === TREASURY_GRANT_ACTION_ID;

  const defaultDescription = selectedTemplate?.buildDescription?.(formValues) ?? selectedTemplate?.label ?? "";
  const effectiveDescription = customDescription.trim() || defaultDescription;
  const activeProposalThreshold = proposalThreshold;

  const grantAmount = useMemo(
    () => (isTreasuryGrant ? parsePreviewCrepAmount(formValues.amount) : undefined),
    [formValues.amount, isTreasuryGrant],
  );

  const { data: timelockTreasuryBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf" as any,
    args: [timelockAddress] as any,
    query: { enabled: isTreasuryGrant && !!timelockAddress },
  });

  const { data: configuredTreasuryAddress } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "treasury" as any,
    query: { enabled: isTreasuryGrant },
  });

  const treasuryBalance = timelockTreasuryBalance as bigint | undefined;
  const treasuryAddressMismatch =
    isTreasuryGrant &&
    !!timelockAddress &&
    typeof configuredTreasuryAddress === "string" &&
    configuredTreasuryAddress.toLowerCase() !== timelockAddress.toLowerCase();
  const grantExceedsTreasury =
    isTreasuryGrant && grantAmount !== undefined && treasuryBalance !== undefined && grantAmount > treasuryBalance;

  const groupedTemplates = useMemo(() => {
    const grouped = new Map<string, GovernanceActionTemplate[]>();
    for (const template of visibleTemplates) {
      const current = grouped.get(template.group) ?? [];
      current.push(template);
      grouped.set(template.group, current);
    }
    return [...grouped.entries()];
  }, [visibleTemplates]);

  const proposalBlocked =
    selectedTemplate?.mode === "proposal" &&
    activeProposalThreshold !== undefined &&
    votingPower !== undefined &&
    votingPower < activeProposalThreshold;

  const parser: FieldParser = {
    address: (key, label) => {
      const value = formValues[key]?.trim() ?? "";
      if (!isAddress(value)) throw new Error(`${label} must be a valid address.`);
      return value as Address;
    },
    uint: (key, label) => {
      const value = formValues[key]?.trim() ?? "";
      if (!/^\d+$/.test(value)) throw new Error(`${label} must be a whole number.`);
      return BigInt(value);
    },
    crep: (key, label) => {
      const value = formValues[key]?.trim() ?? "";
      try {
        return parseUnits(value, 6);
      } catch {
        throw new Error(`${label} must be a valid cREP amount.`);
      }
    },
    bytes32: (key, label) => {
      const value = formValues[key]?.trim() ?? "";
      if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
        throw new Error(`${label} must be a 32-byte hex value.`);
      }
      return value as `0x${string}`;
    },
    string: (key, label) => {
      const value = formValues[key]?.trim() ?? "";
      if (!value) throw new Error(`${label} is required.`);
      return value;
    },
    csv: key =>
      (formValues[key] ?? "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean),
  };

  const handleActionChange = (actionId: string) => {
    setSelectedActionId(actionId);
    setFormValues({});
    setCustomDescription("");
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTemplate) return;

    setFormError(null);

    try {
      for (const field of selectedTemplate.fields) {
        if (!field.required) continue;
        const raw = formValues[field.key]?.trim() ?? "";
        if (!raw) {
          throw new Error(`${field.label} is required.`);
        }
      }

      const targetContract = knownContractsByName[selectedTemplate.contractName];
      if (!targetContract) {
        throw new Error("This action is unavailable on this network.");
      }

      if (selectedTemplate.mode === "proposal" && isGovernorContractLoading) {
        throw new Error("Checking governance availability. Try again in a moment.");
      }

      if (selectedTemplate.mode === "proposal" && (!hasGovernorContract || !governorAddress)) {
        throw new Error("Governance proposals are unavailable on this network.");
      }

      if (selectedTemplate.mode === "proposal" && proposalBlocked) {
        throw new Error("You do not currently meet the proposal threshold for governor proposals.");
      }

      if (selectedTemplate.mode === "proposal") {
        if (!effectiveDescription) {
          throw new Error("Proposal description is required.");
        }
      }

      const proposalDescriptionHash =
        selectedTemplate.mode === "proposal" && effectiveDescription
          ? getProposalDescriptionHash(effectiveDescription)
          : undefined;
      const args = selectedTemplate.buildArgs(formValues, parser, proposalDescriptionHash);

      if (selectedTemplate.mode === "proposal") {
        const txHash = await writeContractAsync({
          address: governorAddress!,
          abi: governorAbi,
          functionName: "propose",
          args: [
            [targetContract.address],
            [0n],
            [
              encodeFunctionData({
                abi: targetContract.abi,
                functionName: selectedTemplate.functionName,
                args,
              } as any),
            ],
            effectiveDescription,
          ],
        });

        if (!txHash) return;

        await waitForTransactionReceipt(wagmiConfig, { hash: txHash });
      } else {
        const txHash = await writeContractAsync({
          address: targetContract.address,
          abi: targetContract.abi,
          functionName: selectedTemplate.functionName,
          args,
        });

        if (!txHash) return;
      }

      await queryClient.invalidateQueries();
      setFormValues({});
      setCustomDescription("");
      setFormError(null);
    } catch (error: any) {
      const message = error?.shortMessage || error?.message || "Unable to submit governance action.";
      setFormError(message);
    }
  };

  return (
    <div id="governance-action-composer" className="surface-card rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className={surfaceSectionHeadingClassName}>Governance Action Composer</h2>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-base text-base-content/70">
          <input
            type="checkbox"
            className="toggle toggle-sm"
            checked={showAdvanced}
            onChange={event => {
              setShowAdvanced(event.target.checked);
              setSelectedActionId("");
              setFormValues({});
              setCustomDescription("");
              setFormError(null);
            }}
          />
          Show advanced actions
        </label>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="label">
            <span className="label-text">Action</span>
          </label>
          <select
            className="select select-bordered w-full"
            value={selectedActionId}
            onChange={event => handleActionChange(event.target.value)}
          >
            <option value="">Select a governance action</option>
            {groupedTemplates.map(([group, templates]) => (
              <optgroup key={group} label={group}>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {selectedTemplate && (
          <>
            <div className="bg-base-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-base font-medium bg-primary/10 text-primary">
                  {selectedTemplate.mode === "proposal" ? "Governor Proposal" : "Direct Transaction"}
                </span>
                <span className="font-mono text-base text-base-content/70">
                  {selectedTemplate.contractName}.{selectedTemplate.functionName}
                </span>
              </div>
              <p className="text-base text-base-content/70">{selectedTemplate.description}</p>
              {selectedTemplate.note && <p className="text-base text-warning">{selectedTemplate.note}</p>}
            </div>

            {selectedTemplate.fields.map(field => (
              <div key={field.key}>
                <label className="label">
                  <span className="label-text">{field.label}</span>
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    className="textarea textarea-bordered w-full min-h-[96px]"
                    value={formValues[field.key] ?? ""}
                    placeholder={field.placeholder}
                    onChange={event => setFormValues(current => ({ ...current, [field.key]: event.target.value }))}
                  />
                ) : (
                  <input
                    className="input input-bordered w-full"
                    type="text"
                    value={formValues[field.key] ?? ""}
                    placeholder={field.placeholder}
                    onChange={event => setFormValues(current => ({ ...current, [field.key]: event.target.value }))}
                  />
                )}
                {field.helperText && <p className="text-base text-base-content/50 mt-1">{field.helperText}</p>}
              </div>
            ))}

            {selectedTemplate.mode === "proposal" && selectedTemplate.allowCustomDescription !== false && (
              <div>
                <label className="label">
                  <span className="label-text">Proposal description</span>
                </label>
                <textarea
                  className="textarea textarea-bordered w-full min-h-[96px]"
                  value={customDescription}
                  placeholder={defaultDescription}
                  onChange={event => setCustomDescription(event.target.value)}
                />
                <p className="text-base text-base-content/50 mt-1">
                  Leave this blank to use the generated description above.
                </p>
              </div>
            )}

            <div className="bg-base-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-base font-medium">
                <ArrowsRightLeftIcon className="w-4 h-4 text-primary" />
                Submission Preview
              </div>
              <p className="text-base text-base-content/70">
                {selectedTemplate.mode === "proposal"
                  ? `Create a proposal targeting ${selectedTemplate.contractName}.${selectedTemplate.functionName}.`
                  : `Send a direct transaction to ${selectedTemplate.contractName}.${selectedTemplate.functionName}.`}
              </p>
              {selectedTemplate.mode === "proposal" && (
                <p className="text-base text-base-content/50">
                  Description: <span className="text-base-content/80">{effectiveDescription || "—"}</span>
                </p>
              )}
              {isTreasuryGrant && (
                <div className="space-y-2 pt-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div>
                      <p className="text-base text-base-content/50">Timelock treasury balance</p>
                      <p className="font-mono text-base text-base-content/80">{formatCRepAmount(treasuryBalance)}</p>
                    </div>
                    <div>
                      <p className="text-base text-base-content/50">Share of treasury</p>
                      <p className="font-mono text-base text-base-content/80">
                        {formatPercentOf(grantAmount, treasuryBalance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-base text-base-content/50">Share of proposal threshold</p>
                      <p className="font-mono text-base text-base-content/80">
                        {formatPercentOf(grantAmount, activeProposalThreshold)}
                      </p>
                    </div>
                  </div>
                  <p className="text-base text-base-content/50">
                    Current quorum impact:{" "}
                    <span className="font-mono text-base-content/80">
                      {formatPercentOf(grantAmount, currentQuorum)}
                    </span>
                  </p>
                  {treasuryAddressMismatch && (
                    <p className="text-base text-warning">
                      The ContentRegistry treasury address is not the governor timelock. This proposal spends cREP held
                      by the timelock treasury.
                    </p>
                  )}
                  {grantExceedsTreasury && (
                    <p className="text-base text-warning">
                      The grant amount exceeds the current timelock cREP balance, so execution would fail unless the
                      treasury receives more cREP before execution.
                    </p>
                  )}
                </div>
              )}
              {selectedTemplate.mode === "proposal" && isGovernorContractLoading && (
                <p className="text-base text-base-content/50">Checking governance availability...</p>
              )}
              {selectedTemplate.mode === "proposal" && !isGovernorContractLoading && !hasGovernorContract && (
                <p className="text-base text-warning">Governance proposals are unavailable on this network.</p>
              )}
              {proposalBlocked && (
                <p className="text-base text-warning">
                  Your current voting power is below the live governor threshold, so this proposal would revert.
                </p>
              )}
            </div>

            {formError && <p className="text-base text-error">{formError}</p>}

            <button
              className="btn btn-primary w-full"
              disabled={
                isPending || (selectedTemplate.mode === "proposal" && (!hasGovernorContract || proposalBlocked))
              }
            >
              {selectedTemplate.mode === "proposal" ? "Create Proposal" : "Send Transaction"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
