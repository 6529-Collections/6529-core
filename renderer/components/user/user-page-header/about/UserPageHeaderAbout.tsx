import {
  CicStatement,
  IProfileAndConsolidations,
} from "../../../../entities/IProfile";
import { useEffect, useState } from "react";
import PencilIcon from "../../../utils/icons/PencilIcon";
import UserPageHeaderAboutStatement from "./UserPageHeaderAboutStatement";
import UserPageHeaderAboutEdit from "./UserPageHeaderAboutEdit";

enum AboutStatementView {
  STATEMENT = "STATEMENT",
  EDIT = "EDIT",
}

export default function UserPageHeaderAbout({
  profile,
  statement,
  canEdit,
}: {
  readonly profile: IProfileAndConsolidations;
  readonly statement: CicStatement | null;
  readonly canEdit: boolean;
}) {
  const [view, setView] = useState<AboutStatementView>(
    AboutStatementView.STATEMENT
  );

  useEffect(() => {
    setView(AboutStatementView.STATEMENT);
  }, [profile, statement, canEdit]);

  const toggleView = () => {
    if (view === AboutStatementView.STATEMENT) {
      setView(AboutStatementView.EDIT);
    } else {
      setView(AboutStatementView.STATEMENT);
    }
  };

  const onEditClick = () => {
    if (view === AboutStatementView.STATEMENT) {
      toggleView();
    }
  };

  return (
    <div>
      {view === AboutStatementView.STATEMENT && (
        <div className="tw-max-w-full lg:tw-max-w-prose tw-mt-4">
          <button
            onClick={onEditClick}
            disabled={!canEdit}
            className="tw-text-iron-500 hover:tw-text-iron-200 tw-text-left tw-group tw-bg-transparent tw-border-none tw-m-0 tw-p-0 tw-relative tw-transition tw-duration-300 tw-ease-out"
          >
            <UserPageHeaderAboutStatement statement={statement} />
            {canEdit && (
              <div
                className={`${
                  statement ? "group-hover:tw-block tw-hidden" : "tw-block"
                }  tw-text-iron-400`}
              >
                <PencilIcon />
              </div>
            )}
          </button>
        </div>
      )}

      {view === AboutStatementView.EDIT && (
        <div className="tw-max-w-full tw-mt-4">
          <UserPageHeaderAboutEdit
            profile={profile}
            statement={statement}
            onClose={() => setView(AboutStatementView.STATEMENT)}
          />
        </div>
      )}
    </div>
  );
}
