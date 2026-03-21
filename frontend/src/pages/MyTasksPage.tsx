import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Users, UserCheck, ChevronRight, Loader2, Inbox } from 'lucide-react';
import toast from 'react-hot-toast';
import { responses as responsesApi } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import type { WorkflowTask } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function MyTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await responsesApi.myTasks();
      setTasks(data.tasks);
    } catch {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-lg bg-purple-100 p-2">
          <ClipboardList className="h-6 w-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
          <p className="text-sm text-gray-500">
            Responses waiting for your review or approval
          </p>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox className="h-16 w-16 text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-600 mb-1">No pending tasks</h2>
          <p className="text-sm text-gray-400 max-w-md">
            When form responses reach a workflow stage that requires your input,
            they will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const stageProgress = `${task.stageOrder}/${task.totalStages}`;

            return (
              <div
                key={task.id}
                className="bg-white border border-gray-200 rounded-lg hover:border-purple-200 hover:shadow-sm transition-all"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left content */}
                    <div className="min-w-0 flex-1">
                      {/* Form title and stage */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {task.formTitle}
                        </h3>
                        <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50 shrink-0">
                          {task.stageName}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          Stage {stageProgress}
                        </span>
                      </div>

                      {/* Submission info */}
                      <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                        <span>Submitted {formatDate(task.createdAt)}</span>
                        {task.submitterEmail && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span>{task.submitterEmail}</span>
                          </>
                        )}
                      </div>

                      {/* Who can act */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {task.allowedRoles.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>
                              {task.allowedRoles.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')}
                            </span>
                          </div>
                        )}
                        {task.allowedGroups.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Users className="h-3.5 w-3.5" />
                            <span>
                              {task.allowedGroups.length} group{task.allowedGroups.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right – action */}
                    <div className="shrink-0 flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => navigate(`/forms/${task.formId}/responses/${task.id}/edit`)}
                      >
                        Review
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>

                  {/* Workflow progress bar */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: task.totalStages }, (_, i) => {
                        const isCompleted = i + 1 < task.stageOrder;
                        const isCurrent = i + 1 === task.stageOrder;
                        return (
                          <div
                            key={i}
                            className={cn(
                              'h-1.5 flex-1 rounded-full transition-colors',
                              isCompleted
                                ? 'bg-green-400'
                                : isCurrent
                                  ? 'bg-purple-400'
                                  : 'bg-gray-200',
                            )}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
