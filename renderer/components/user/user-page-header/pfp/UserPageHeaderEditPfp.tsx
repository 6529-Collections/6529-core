"use client";

import { AuthContext } from "@/components/auth/Auth";
import MobileWrapperDialog from "@/components/mobile-wrapper-dialog/MobileWrapperDialog";
import {
  QueryKey,
  ReactQueryWrapperContext,
} from "@/components/react-query-wrapper/ReactQueryWrapper";
import UserSettingsImgSelectFile from "@/components/user/settings/UserSettingsImgSelectFile";
import type { NFTLite } from "@/components/user/settings/UserSettingsImgSelectMeme";
import UserSettingsImgSelectMeme from "@/components/user/settings/UserSettingsImgSelectMeme";
import Button from "@/components/utils/button/Button";
import type { ApiCreateOrUpdateProfileRequest } from "@/entities/IProfile";
import type { ApiIdentity } from "@/generated/models/ApiIdentity";
import { getScaledImageUri, ImageScale } from "@/helpers/image.helpers";
import {
  commonApiFetch,
  commonApiPost,
  commonApiPostForm,
} from "@/services/api/common-api";
import {
  LocalProfilePictureUploadError,
  uploadProfilePictureFile,
} from "@/components/ipfs/profilePictureUpload";
import { getUploadErrorMessage } from "@/services/api/upload-error";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useContext, useRef, useState } from "react";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { getUserProfileHeaderMessage } from "../user-page-header.messages";
export default function UserPageHeaderEditPfp({
  profile,
  embedded = false,
  isOpen = true,
  onAfterLeave,
  onBack,
  onClose,
}: {
  readonly profile: ApiIdentity;
  readonly embedded?: boolean;
  readonly isOpen?: boolean;
  readonly onAfterLeave?: (() => void) | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly onClose: () => void;
}) {
  const { setToast, requestAuth } = useContext(AuthContext);
  const { onProfileEdit } = useContext(ReactQueryWrapperContext);

  const { data: memes } = useQuery({
    queryKey: [QueryKey.MEMES_LITE],
    queryFn: async () => {
      const memesResponse = await commonApiFetch<{
        count: number;
        data: NFTLite[];
        next: string | null;
        page: number;
      }>({
        endpoint: "memes_lite",
      });
      return memesResponse.data;
    },
  });

  const savedImage = profile.pfp
    ? getScaledImageUri(profile.pfp, ImageScale.W_200_H_200)
    : null;

  const [selectedMeme, setSelectedMeme] = useState<NFTLite | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const canRetryVia6529 = retryFile !== null && retryFile === file;

  // The preview URL is revoked when the file is replaced or cleared and when
  // the editor unmounts.
  const filePreviewUrl = useObjectUrl(file);
  let imageToShow = savedImage;
  if (file) {
    imageToShow = filePreviewUrl ?? savedImage;
  } else if (selectedMeme) {
    imageToShow = selectedMeme.scaled ?? selectedMeme.image;
  }

  const setSelectedMemeAndRemoveFile = (meme: NFTLite) => {
    setSelectedMeme(meme);
    setFile(null);
    setError(null);
    setRetryFile(null);
  };

  const setFileAndRemoveMeme = (file: File) => {
    setFile(file);
    setSelectedMeme(null);
    setError(null);
    setRetryFile(null);
  };

  const [saving, setSaving] = useState<boolean>(false);
  const savingRef = useRef(false);

  const updatePfp = useMutation({
    mutationFn: async ({
      picture,
      meme,
      retryVia6529,
    }: {
      readonly picture: File | null;
      readonly meme: NFTLite | null;
      readonly retryVia6529: boolean;
    }) => {
      if (!profile.handle) {
        throw new Error("Profile handle is required");
      }
      if (picture) {
        if (!profile.classification) {
          return;
        }
        const ipfs = await uploadProfilePictureFile(picture, retryVia6529);
        const ipfsBody: ApiCreateOrUpdateProfileRequest = {
          handle: profile.handle,
          classification: profile.classification,
          pfp_url: ipfs,
        };
        if (profile?.banner1) {
          ipfsBody.banner_1 = profile?.banner1;
        }
        if (profile?.banner2) {
          ipfsBody.banner_2 = profile?.banner2;
        }
        const response = await commonApiPost<
          ApiCreateOrUpdateProfileRequest,
          ApiIdentity
        >({
          endpoint: `profiles`,
          body: ipfsBody,
        });
        return response?.pfp;
      } else {
        if (!meme) throw new Error("Select an image.");
        const body = new FormData();
        body.append("meme", meme.id.toString());
        const response = await commonApiPostForm<{ pfp_url: string }>({
          endpoint: `profiles/${profile.query}/pfp`,
          body: body,
        });
        return response.pfp_url;
      }
    },
    onSuccess: (pfp_url) => {
      onProfileEdit({
        profile: {
          ...profile,
          pfp: pfp_url ?? null,
        },
        previousProfile: null,
      });
      setFile(null);
      setSelectedMeme(null);
      setRetryFile(null);
      setToast({
        message: "Profile updated.",
        type: "success",
      });
      onClose();
    },
  });

  const submit = async (retryVia6529 = false) => {
    if (savingRef.current || (retryVia6529 && !canRetryVia6529)) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    if (!retryVia6529) setRetryFile(null);
    try {
      const { success } = await requestAuth();
      if (!success) throw new Error("Log in to save settings.");
      if (!file && !selectedMeme) throw new Error("Select an image.");
      if (file && file.size > 2097152) {
        setError("File size must be less than 2MB");
        return;
      }
      await updatePfp.mutateAsync({
        picture: file,
        meme: selectedMeme,
        retryVia6529,
      });
    } catch (cause) {
      if (cause instanceof LocalProfilePictureUploadError && file) {
        setRetryFile(file);
        setError(cause.message);
      } else {
        setToast({ message: getUploadErrorMessage(cause), type: "error" });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };

  const form = (
    <form onSubmit={onSubmit} aria-busy={saving} className="tw-px-5 sm:tw-px-6">
      <fieldset disabled={saving} className="tw-m-0 tw-min-w-0 tw-border-0 tw-p-0">
        <UserSettingsImgSelectMeme
          compact
          memes={memes ?? []}
          onMeme={setSelectedMemeAndRemoveFile}
        />

        <div className="tw-my-4 tw-flex tw-w-full tw-items-center tw-gap-3">
          <span className="tw-h-px tw-flex-1 tw-bg-white/5" />
          <span className="tw-text-xs tw-font-normal tw-text-iron-400">
            {getUserProfileHeaderMessage(
              "user.profileHeader.edit.pictureSourceAlternative"
            )}
          </span>
          <span className="tw-h-px tw-flex-1 tw-bg-white/5" />
        </div>

        <UserSettingsImgSelectFile
          compact
          imageToShow={imageToShow}
          setFile={setFileAndRemoveMeme}
        />
      </fieldset>
      {error && (
        <p
          role="alert"
          className="tw-mt-3 tw-rounded-lg tw-border tw-border-solid tw-border-error/20 tw-bg-error/10 tw-px-3 tw-py-2 tw-text-sm tw-text-error"
        >
          {error}
        </p>
      )}
      {canRetryVia6529 && (
        <Button
          variant="secondary"
          size="sm"
          disabled={saving}
          onClick={() => void submit(true)}
        >
          {getUserProfileHeaderMessage("user.profileHeader.edit.uploadVia6529")}
        </Button>
      )}
      <div className="tw-flex tw-flex-col tw-gap-2 tw-pt-5 md:tw-flex-row-reverse md:tw-justify-start">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={saving}
          disabled={!file && !selectedMeme}
          fullWidth
          className="md:tw-w-auto"
        >
          Save PFP
        </Button>
        <Button
          variant="ghost"
          size="lg"
          disabled={saving}
          onClick={onClose}
          fullWidth
          className="tw-hidden md:tw-inline-flex md:tw-w-auto"
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  if (embedded) {
    return form;
  }

  return (
    <MobileWrapperDialog
      title={getUserProfileHeaderMessage("user.profileHeader.edit.pfp")}
      isOpen={isOpen}
      onClose={onClose}
      onBack={onBack}
      onAfterLeave={onAfterLeave}
      tabletModal
      showHeaderCloseButton
      headerVariant="minimal"
      headerClassName="!tw-px-5 tw-pb-5 sm:!tw-px-6"
      titleClassName="!tw-text-base !tw-font-medium"
      showScrollbar
      maxWidthClass="md:tw-max-w-2xl"
    >
      {form}
    </MobileWrapperDialog>
  );
}
